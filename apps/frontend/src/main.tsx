import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./Global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Analytics from "./domain/Analytics";
import Assistant from "./domain/Assistant";
import Calendar from "./domain/Calendar";
import Inbox from "./domain/Inbox";
import Lock from "./domain/Lock";
import { Toaster } from "./domain/onboarding/components/ui/sonner";
import Dashboard from "./domain/onboarding/Dashboard";
import Onboarding from "./domain/onboarding/Onboarding";
import Rules from "./domain/Rules";
import Safeguards from "./domain/Safeguards";
import Sessions from "./domain/Sessions";
import Settings from "./domain/Settings";
import System from "./domain/System";
import Tasks from "./domain/Tasks";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 60_000,
			refetchOnWindowFocus: false,
		},
	},
});

const router = createBrowserRouter([
	{
		path: "/",
		element: <App />,
	},
	{
		path: "/onboarding",
		element: <Onboarding />,
	},
	{
		path: "/app",
		element: <Dashboard />,
	},
	{
		path: "/rules",
		element: <Rules />,
	},
	{
		path: "/inbox",
		element: <Inbox />,
	},
	{
		path: "/tasks",
		element: <Tasks />,
	},
	{
		path: "/calendar",
		element: <Calendar />,
	},
	{
		path: "/sessions",
		element: <Sessions />,
	},
	{
		path: "/system",
		element: <System />,
	},
	{
		path: "/lock",
		element: <Lock />,
	},
	{
		path: "/safeguards",
		element: <Safeguards />,
	},
	{
		path: "/analytics",
		element: <Analytics />,
	},
	{
		path: "/assistant",
		element: <Assistant />,
	},
	{
		path: "/settings",
		element: <Settings />,
	},
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
			<Toaster position="top-center" theme="dark" />
		</QueryClientProvider>
	</React.StrictMode>,
);
