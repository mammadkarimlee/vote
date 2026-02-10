import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const localProvisionTarget =
		env.VITE_LOCAL_PROVISION_TARGET || "http://localhost:8787";

	return {
		plugins: [react()],
		base: env.VITE_BASE_PATH || "/",
		server: {
			proxy: {
				"/provision-user": {
					target: localProvisionTarget,
					changeOrigin: true,
				},
				"/ai/teacher-feedback": {
					target: localProvisionTarget,
					changeOrigin: true,
				},
				"/health": {
					target: localProvisionTarget,
					changeOrigin: true,
				},
				"/api/provision-user": {
					target: localProvisionTarget,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, ""),
				},
				"/api/health": {
					target: localProvisionTarget,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, ""),
				},
				"/api/ai/teacher-feedback": {
					target: localProvisionTarget,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, ""),
				},
			},
		},
	};
});
