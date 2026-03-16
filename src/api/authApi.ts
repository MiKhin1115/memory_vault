import { AuthApiClient } from "../axios/auth-api-client";


export const requestToken = async () => {
    const formData = new URLSearchParams();
    formData.append('grant_type', 'client_credentials');
    formData.append('client_id', import.meta.env.VITE_CLIENT_ID);
    formData.append('client_secret', import.meta.env.VITE_CLIENT_SECRET);

    const response = await AuthApiClient.post('/oauth2/token', formData);
    return response.data.access_token;
}