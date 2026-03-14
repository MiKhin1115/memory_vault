# Wedding Guest Upload

A private wedding upload page built with React and Node.js. Guests can enter their name, leave a message, and upload multiple photos. Submissions are stored privately for the couple only.

## What it does

- Collects guest name, message, and multiple photos in a mobile-friendly React form
- Compresses browser-supported images in the client before upload
- Accepts only JPG, PNG, and JPEG image uploads on the backend
- Saves uploaded files to `uploads/`
- Saves guest metadata and saved filenames to `data/submissions.json`
- Shows a private thank-you screen after submission with no public gallery or live wall

## Run locally

1. Install dependencies with `npm install`
2. Start the frontend and backend together with `npm run dev`
3. Open the Vite URL shown in the terminal

The React dev server proxies `/api` requests to the Node server on port `3001`.

## Production

1. Build the frontend with `npm run build`
2. Start the Node server with `npm run server`

If `dist/` exists, the Node server will also serve the built React app.
