# Vinaya Desktop Application

Live a life you always wanted to

## Introduction

Vinaya is a productivity system that helps you live a life you always wanted to live by enabling the settings based on user's determination and cannot be changed unless user does some activity which makes user think twice before changing the setting again. 

## Desktop application Architecture

### Domains

#### Setup routes (Configued to call blockers)
1. Rules - Defines the rules to track and block different websites.
2. Tasks - Defines the tasks/todos that needs to be done. Acts as a flexible planning option with a priority order. 
3. Calendar - Defines the events that has a fixed time block and should be executed on the given time.
4. Sessions - Defines the sessions like pomodoro session, deepwork session, flow state, etc that requires X amount of work, Y amount of rest
5. System - Defines the system/habitual actions that needs to be performed for n frequency for every time slice or time block
6. Safeguards - Defines the rules that also gets processed by local LLM to determine whether to block the website or not.


#### Feature routes
7. Inbox - Contains the calls, notifications, alerts for self-realization
8. Analytics - Contains tools for analysis of your activities
9. Assistant - Contains LLM integration for the capability of asking questions related to your behavior
10. Settings - Contains the abstraction to change the working mechanism of the application
11. Lock - Contains tools to add locks in certain websites that unlocks with certain password

---

### Blockers

#### 1. Temporary Block

This will block certain apps if the given time limit is exceeded. This will be triggered by calendar/rules/safeguards

#### 2. Permanent Block

This will block certain apps forever until the Vinaya app itself is deleted. This will be triggered by rules/safeguards

#### 3. Popups

##### - Break
This will be triggered by the Sessions

##### - Challenge
This will be triggered by the System

#### 4. Notification

##### - Reminder
This will be triggered by the tasks

##### - Warning
This will be triggred by the calendar/rules/safeguards

---

### Features

#### 1. Customizability
#### 2. Privacy
#### 3. Implementability
#### 4. Free & Open Source
#### 5. Manageable TaskSystem (Tasks, Calendar)
#### 6. Rules and Safeguards
#### 7. Gamification
#### 8. Assistant and Analytics
#### 9. Workstations
#### 10. Accessibility