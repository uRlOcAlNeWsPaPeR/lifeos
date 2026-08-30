# Firebase setup for LifeOS

LifeOS uses **Firebase Authentication** (accounts) and **Cloud Firestore** (all data,
saved per account). Do this once.

---

## 1. Enable Email/Password sign-in

1. [Firebase console](https://console.firebase.google.com/) → your project
2. **Build → Authentication → Get started**
3. **Sign-in method** tab → **Email/Password** → toggle **Enable** → **Save**

## 2. Register a Web app + copy the config

1. **Project settings** (gear icon, top-left) → **General** tab
2. Scroll to **Your apps** → click the **`</>`** (Web) icon
3. Nickname it "LifeOS Web", **Register app** (skip Hosting for now)
4. You'll see a `firebaseConfig` object. Copy each value into `.env`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY="AIza..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="123456789"
NEXT_PUBLIC_FIREBASE_APP_ID="1:123...:web:abc..."
```

> These are **public** — they're meant to ship in the browser bundle. Security
> comes from the Firestore rules, not from hiding these.

## 3. Create the Firestore database

1. **Build → Firestore Database → Create database**
2. Start in **production mode** (rules below lock it down properly)
3. Pick a location close to you → **Enable**

## 4. Deploy the security rules

The repo ships [`firestore.rules`](firestore.rules) — a user can only touch
`users/{their-uid}/**`.

**Option A — paste in the console (quickest):**
Firestore → **Rules** tab → replace everything with the contents of
`firestore.rules` → **Publish**.

**Option B — Firebase CLI:**
```bash
npm i -g firebase-tools
firebase login
firebase use --add            # pick your project
npm run firebase:rules
```

## 5. Service account (for the AI features only)

Brain Dump, AI Priority and the Assistant run **server-side** (so the Gemini key
stays secret) and read Firestore with the Admin SDK.

1. **Project settings → Service accounts → Generate new private key** → downloads a JSON file
2. Open the JSON, copy the whole thing onto **one line**, and put it in `.env`:

```env
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n", ... }'
```

If your editor mangles the newlines, base64 it instead:
```bash
base64 -w0 serviceAccount.json      # macOS: base64 -i serviceAccount.json
```
```env
FIREBASE_SERVICE_ACCOUNT_B64="ewogICJ0eXBlIjog..."
```

> **Secret.** Never commit this. It's already in `.gitignore`.

## 6. Restart

```bash
npm run dev
```

Open http://localhost:3000 → **Get Started** → create an account → onboarding →
your dashboard. Everything you add is saved under `users/{your-uid}` in Firestore
and is visible in the console under **Firestore Database → Data**.

---

## What works without which piece

| Feature | Needs |
|---|---|
| Sign up / log in / reset password | Firebase config (steps 1–2) |
| Tasks, goals, calendar, school, dashboard, analytics — all CRUD, saved per account | Firebase config + Firestore + rules (steps 1–4) |
| Brain Dump, AI Priority, AI Assistant | + Service account (step 5) + `GEMINI_API_KEY` (already set) |

## Deploying later

- **Firebase Hosting / Cloud Run / GCP**: the Admin SDK auto-detects credentials — you can drop `FIREBASE_SERVICE_ACCOUNT` and it uses Application Default Credentials.
- **Vercel / Netlify / other**: set all the `.env` values as environment variables in the dashboard.
- Add your production domain under **Authentication → Settings → Authorized domains**.
