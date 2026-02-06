import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { AuthProvider } from "./features/auth/AuthProvider";

const basePath = import.meta.env.VITE_BASE_PATH || "/";
const normalizedBase = basePath === "/" ? "/" : basePath.replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter basename={normalizedBase}>
			<ThemeProvider>
				<AuthProvider>
					<App />
				</AuthProvider>
			</ThemeProvider>
		</BrowserRouter>
	</StrictMode>,
);
