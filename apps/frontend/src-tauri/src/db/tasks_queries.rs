use sqlx::{Row, SqlitePool};

use super::models::{NewTask, Task};

fn now_string_local() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// Serializes a `completion_trigger` JSON value to its stored text form.
fn trigger_to_string(trigger: &Option<serde_json::Value>) -> Option<String> {
    match trigger {
        Some(serde_json::Value::Null) | None => None,
        Some(value) => serde_json::to_string(value).ok(),
    }
}

pub async fn insert_task(pool: &SqlitePool, input: &NewTask) -> Result<Task, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let trigger = trigger_to_string(&input.completion_trigger);

    sqlx::query(
        "INSERT INTO tasks (id, title, description, due_date, recurrence_rule,
                            energy_level, completion_trigger, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.title)
    .bind(&input.description)
    .bind(&input.due_date)
    .bind(&input.recurrence_rule)
    .bind(&input.energy_level)
    .bind(&trigger)
    .bind(&input.user_id)
    .execute(pool)
    .await
    .map_err(|e| format!("insert task: {e}"))?;

    get_task(pool, &id)
        .await?
        .ok_or_else(|| format!("task {id} not found after insert"))
}

pub async fn get_task(pool: &SqlitePool, id: &str) -> Result<Option<Task>, String> {
    sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("select task: {e}"))
}

/// All tasks, pending first (newest first), then completed (newest first).
/// Recurring tasks collapse to their latest instance so historic chains don't
/// pile up: only the newest pending instance (the upcoming occurrence) and the
/// newest completed instance per `parent_task_id` root are returned.
pub async fn list_tasks(pool: &SqlitePool) -> Result<Vec<Task>, String> {
    let rows = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks
         ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list tasks: {e}"))?;

    Ok(rows)
}

/// The 10 most recent uncompleted tasks, newest first. Used as local context
/// for AI task suggestions.
pub async fn recent_uncompleted_tasks(pool: &SqlitePool, limit: i32) -> Result<Vec<Task>, String> {
    sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE status = 'pending'
         ORDER BY created_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("recent uncompleted tasks: {e}"))
}

/// Pending tasks that carry a `completion_trigger` (auto-completion candidates).
pub async fn pending_with_trigger(pool: &SqlitePool) -> Result<Vec<Task>, String> {
    sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks
         WHERE status = 'pending' AND completion_trigger IS NOT NULL
         ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("pending trigger tasks: {e}"))
}

/// Marks a task completed, stamping a local-time completion timestamp.
pub async fn mark_completed(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query(
        "UPDATE tasks SET status = 'completed', completed_at = ?
         WHERE id = ? AND status = 'pending'",
    )
    .bind(now_string_local())
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("mark task completed: {e}"))?;
    Ok(())
}

/// Marks a task pending again (un-complete), clearing the completion stamp.
pub async fn reopen_task(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("UPDATE tasks SET status = 'pending', completed_at = NULL WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("reopen task: {e}"))?;
    Ok(())
}

/// Completes a pending task and, if it carries a recurrence rule, creates the
/// next instance (due on the next occurrence). Idempotent for recursion chains:
/// a task already completed returns unchanged. Returns the current state of the
/// completed task.
pub async fn complete_with_recurrence(pool: &SqlitePool, id: &str) -> Result<Task, String> {
    let task = get_task(pool, id)
        .await?
        .ok_or_else(|| format!("task {id} not found"))?;

    if task.status == "pending" {
        mark_completed(pool, id).await?;
        if let Some(rule) = &task.recurrence_rule {
            if let Some(next) = crate::tasks::recurrence::get_next_due_date(rule) {
                insert_recurrence_instance(pool, id, &next).await?;
            }
        }
    }

    get_task(pool, id)
        .await?
        .ok_or_else(|| format!("task {id} not found after completion"))
}

pub async fn update_task(pool: &SqlitePool, task: &Task) -> Result<Task, String> {
    sqlx::query(
        "UPDATE tasks SET
            title = ?, description = ?, status = ?, due_date = ?,
            recurrence_rule = ?, energy_level = ?, completion_trigger = ?, user_id = ?
         WHERE id = ?",
    )
    .bind(&task.title)
    .bind(&task.description)
    .bind(&task.status)
    .bind(&task.due_date)
    .bind(&task.recurrence_rule)
    .bind(&task.energy_level)
    .bind(&task.completion_trigger)
    .bind(&task.user_id)
    .bind(&task.id)
    .execute(pool)
    .await
    .map_err(|e| format!("update task: {e}"))?;

    get_task(pool, &task.id)
        .await?
        .ok_or_else(|| format!("task {} not found after update", task.id))
}

pub async fn delete_task(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("delete task: {e}"))?;
    Ok(())
}

/// Creates the next pending instance of a recurring task (new `id`, parent set
/// to `parent_id`, due date advanced to the next occurrence).
pub async fn insert_recurrence_instance(
    pool: &SqlitePool,
    parent_id: &str,
    next_due: &str,
) -> Result<Task, String> {
    let parent = get_task(pool, parent_id)
        .await?
        .ok_or_else(|| format!("parent task {parent_id} not found"))?;

    sqlx::query(
        "INSERT INTO tasks (id, title, description, due_date, recurrence_rule,
                            parent_task_id, energy_level, completion_trigger, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&parent.title)
    .bind(&parent.description)
    .bind(next_due)
    .bind(&parent.recurrence_rule)
    .bind(parent_id)
    .bind(&parent.energy_level)
    .bind(&parent.completion_trigger)
    .bind(&parent.user_id)
    .execute(pool)
    .await
    .map_err(|e| format!("insert recurrence instance: {e}"))?;

    let instance = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(parent_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("select recurrence instance: {e}"))?;
    Ok(instance)
}

/// Tasks completed per local day within `[start_date, end_date]`, as
/// `date -> count`. Used by the productivity grid.
pub async fn completed_per_day(
    pool: &SqlitePool,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<(String, i64)>, String> {
    let rows = sqlx::query(
        "SELECT substr(completed_at, 1, 10) AS day, COUNT(*) AS c
         FROM tasks
         WHERE status = 'completed' AND completed_at IS NOT NULL
           AND completed_at >= ? AND completed_at <= ?
         GROUP BY day",
    )
    .bind(format!("{start_date} 00:00:00"))
    .bind(format!("{end_date} 23:59:59"))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("tasks completed per day: {e}"))?;

    Ok(rows
        .into_iter()
        .map(|row| (row.get::<String, _>("day"), row.get::<i64, _>("c")))
        .collect())
}
