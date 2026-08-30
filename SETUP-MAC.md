# Running LifeOS on macOS (or any machine)

LifeOS is a standard Next.js app — nothing in it is Windows-specific. These are
the only steps needed to run it on a Mac.

## 1. Install Node.js 20

Option A — [nodejs.org](https://nodejs.org) → download the **20.x LTS** installer.

Option B — with Homebrew:

```bash
brew install node@20
```

Verify:

```bash
node --version   # should print v20.x
```

## 2. Get the code

```bash
git clone <YOUR_REPO_URL> lifeos
cd lifeos
```

## 3. Add your secrets — `.env`

`.env` is **not** in the repo (it holds API keys). Copy it from the Windows
machine:

- On Windows the file is `C:\Users\adity\Downloads\lifeOS\.env`
- AirDrop it, email it to yourself, or open it in Notepad and paste the contents
  into a new `.env` file at the root of the Mac copy.

`.env.example` in the repo lists every key that must be present.

## 4. Install dependencies

```bash
npm install
```

(Never copy the `node_modules/` folder between machines — it contains
platform-specific binaries. Always run `npm install` fresh.)

## 5. Run it

```bash
npm run dev
```

Open http://localhost:3000

## Other commands

```bash
npm run build     # production build
npm run start     # serve the production build
npm run lint      # eslint
```

## Keeping both machines in sync

Both copies are git clones of the same repo:

```bash
git pull            # get the latest before you start working
git add -A && git commit -m "..."
git push            # share your changes
```

The `.env` file stays local on each machine and is never pushed.
