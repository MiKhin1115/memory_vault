# Wedding Guest Upload

The guest upload frontend is a React + Vite app. Guest photo uploads now go through a dedicated Express proxy server so KBZPay OAuth credentials stay on the backend and the frontend no longer depends on the Netlify upload function.

## Upload flow

Browser -> React + Vite frontend -> standalone proxy server -> KBZPay OAuth token API -> AppCube `add_photo` API -> AppCube database

## Frontend setup

Create a frontend `.env` file with:

```env
VITE_PROXY_API_BASE_URL=http://localhost:3001
```

For production, set `VITE_PROXY_API_BASE_URL` to your deployed proxy domain, for example `https://your-proxy-domain.com`.

Do not put `KBZPAY_CLIENT_ID` or `KBZPAY_CLIENT_SECRET` in any Vite environment file.

## Frontend commands

```bash
npm install
npm run dev
```

## Proxy server setup

Inside `proxy-server/`, copy `.env.example` to `.env` and set:

```env
PORT=3001
KBZPAY_TOKEN_URL=https://uat-miniapp.kbzpay.com/baas/auth/v1.0/oauth2/token
KBZPAY_CLIENT_ID=your_client_id
KBZPAY_CLIENT_SECRET=your_client_secret
APPCUBE_ADD_PHOTO_URL=https://uat-miniapp.kbzpay.com/service/PracticeTodo__DataImport/1.0.0/add_photo
```

Then run:

```bash
cd proxy-server
npm install
npm run dev
```

## Notes

- `src/services/guestUploadService.ts` now calls the dedicated proxy server.
- `netlify/functions/add-photo.js` is left in place but is no longer used by the frontend guest upload flow.
