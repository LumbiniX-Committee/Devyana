import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./Global.css"
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import System from "./domain/System";
import Rules from "./domain/Rules";
import Calendar from "./domain/Calendar";
import Sessions from "./domain/Sessions";
import Safeguards from "./domain/Safeguards";
import Analytics from "./domain/Analytics";
import Assistant from "./domain/Assistant";
import Settings from "./domain/Settings";
import Tasks from "./domain/Tasks";
import Inbox from "./domain/Inbox";
import Lock from "./domain/Lock";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />
  },
  {
    path: "/rules",
    element: <Rules />
  },
  {
    path: "/inbox",
    element: <Inbox />
  },
  {
    path: "/tasks",
    element: <Tasks />
  },
  {
    path: "/calendar",
    element: <Calendar />
  },
  {
    path: "/sessions",
    element: <Sessions />
  },
  {
    path: "/system",
    element: <System />
  },
  {
    path: "/lock",
    element: <Lock />
  },
  {
    path: "/safeguards",
    element: <Safeguards />
  },
  {
    path: "/analytics",
    element: <Analytics />
  },
  {
    path: "/assistant",
    element: <Assistant />
  },
  {
    path: "/settings",
    element: <Settings />
  },
])

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
