import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./Global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import Analytics from "./domain/Analytics";
import Assistant from "./domain/Assistant";
import Calendar from "./domain/Calendar";
import Inbox from "./domain/Inbox";
import Lock from "./domain/Lock";
import { Toaster } from "./domain/onboarding/components/ui/sonner";
import Onboarding from "./domain/onboarding/Onboarding";
import Rules from "./domain/Rules";
import Safeguards from "./domain/Safeguards";
import Sessions from "./domain/Sessions";
import System from "./domain/System";
import Tasks from "./domain/Tasks";
import NegativeWorksDetail from "./pages/NegativeWorksDetail";
import Health from "./pages/Health";
import DebugHome from "./pages/debug/DebugHome";
import DebugDb from "./pages/debug/DebugDb";
import DebugProfile from "./pages/debug/DebugProfile";

import AppLayout from "./layouts/AppLayout";
import DashboardContent from "./pages/DashboardContent";
import NegativeWorksPage from "./pages/NegativeWorksPage";
import LearningPathway from "./pages/LearningPathway";
import SettingsPage from "./pages/SettingsPage";

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
		element: <AppLayout />,
		children: [
			{ index: true, element: <DashboardContent /> },
			{ path: "negative", element: <NegativeWorksPage /> },
			{ path: "learn", element: <LearningPathway /> },
			{ path: "settings", element: <SettingsPage /> },
		],
	},
	{
		path: "/dashboard",
		element: <Navigate to="/app" replace />,
	},
	{
		path: "/health",
		element: <Health />,
	},
	{
		path: "/debug",
		element: <DebugHome />,
	},
	{
		path: "/debug/db",
		element: <DebugDb />,
	},
	{
		path: "/debug/profile",
		element: <DebugProfile />,
	},
	{
		path: "/negative-works",
		element: <NegativeWorksDetail />,
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
		element: <SettingsPage />,
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