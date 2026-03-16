import axios from "axios"
import { requestToken } from "../api/authApi";
import { useAuthStore } from "../store/auth-store"

export const AuthApiClient = axios.create({
    baseURL: import.meta.env.VITE_AUTH_URL,
})

AuthApiClient.interceptors.request.use((config) => {
    const accessToken = useAuthStore.getState().accessToken;
    config.headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (accessToken) {
        config.headers['access-token'] = accessToken;
        if ("Authorization" in config.headers){
            delete config.headers.Authorization;
        }
    }
    return config;
});

AuthApiClient.interceptors.response.use((response) => response,
    async (error) => {
        const originalRequest = error.config;
        if(error.response && error.response.status === 401) {
            originalRequest._retry = true;
            const newToken = await requestToken();
            useAuthStore.getState().setAccessToken(newToken);
                originalRequest.headers['access-token'] = newToken;
                return AuthApiClient(originalRequest);
        }
        return Promise.reject(error);
    }
)