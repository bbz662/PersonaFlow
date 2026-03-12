# Frontend

PersonaFlow's frontend is a minimal Next.js + TypeScript app for the MVP landing page and upcoming voice session flow.

## What is included

- Next.js App Router scaffold
- global layout and metadata
- single landing page with PersonaFlow branding
- placeholder Start Session action for future session flow work
- lightweight CSS styling with no extra UI framework

## Local development

Prerequisite:
- Node.js 20+ and npm

Run locally:

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Notes

- No frontend environment variables are required for this scaffold.
- The Start Session button is intentionally a placeholder and does not call the backend yet.
- Session, microphone, and results flows should be added in follow-up issues.
