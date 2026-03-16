import axios from "axios"
import { useAuthStore } from "../store/auth-store"
import { requestToken } from "../api/authApi";

export const CoreApiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
})

CoreApiClient.interceptors.request.use((config) => {
    const accessToken = useAuthStore.getState().accessToken;
    config.headers["Content-Type"] = "application/json";
    if (accessToken) {
        config.headers['access-token'] = accessToken;
        if ("Authorization" in config.headers){
            delete config.headers.Authorization;
        }
    }
    return config;
});

CoreApiClient.interceptors.response.use((response) => response,
    async (error) => {
        const originalRequest = error.config;
        if(error.response && error.response.status === 401) {
            originalRequest._retry = true;
            const newToken = await requestToken();
            useAuthStore.getState().setAccessToken(newToken);
                originalRequest.headers['access-token'] = newToken;
                return CoreApiClient(originalRequest);
        }
        return Promise.reject(error);
    }
)