# Running locally

## Prerequisites
- **Node.js 22 LTS or newer** (includes npm): https://nodejs.org
- **MongoDB**, either:
  - MongoDB Community Server running on `localhost:27017` (view it with MongoDB Compass), or
  - Docker. The runner can start a `mongo:7` container for you.

## The one command
```bash
node run.mjs            # or: npm start
node run.mjs --demo     # also seeds demo manager / sales users
```
Then open the printed URL (default http://localhost:5173) and sign in as `admin@inventory.local` / `Admin@12345`.
With `--demo`, `manager@inventory.local` and `sales@inventory.local` also work (password `Demo@12345`).
Press **Ctrl+C** to stop both servers.

## What each stage does
| Stage | What happens |
|---|---|
| Preflight | Checks the Node.js version (>= 22) and npm. Detects Docker (optional). |
| Configuration | Creates `server/.env` / `client/.env` from `.env.example` if missing, with a random `JWT_SECRET`. Secrets are shown masked only. |
| Dependencies | Runs `npm install` in root, `server/` and `client/`, but only when `package.json` / `package-lock.json` changed since the last run. Then checks that the key packages resolve. |
| MongoDB | Validates `MONGODB_URI`, checks the port, offers to start Docker MongoDB if it is closed, then logs in and pings. |
| Seed | Idempotent: default roles, page permissions, Super Admin (plus demo users with `--demo`). Never overwrites permission changes made in the UI. |
| Launch | Starts the API and the Vite client. If 5000/5173 are busy, it uses the next free port and wires CORS / API URL to match. It waits for `/api/health` and the client page, then prints the URLs. |

A summary table (OK / WARN / FAIL / SKIP) is printed at the end. The full output and tracebacks go to `run.log`.
Exit codes: `0` ok, `1` a required check failed, `2` bad arguments.

## Flags
| Flag | Effect |
|---|---|
| `--check` | Diagnostics only. Installs nothing, creates nothing, starts nothing. |
| `--demo` | Seed demo users too |
| `--no-seed` | Skip seeding |
| `--no-install` | Skip `npm install` |
| `--start-mongo` | Start the Docker MongoDB container without asking |
| `--no-color` / `--ascii` | Plain output (also honours `NO_COLOR`) |
| `--help` | Show usage |

## Troubleshooting
| Error box | Likely cause | How to fix |
|---|---|---|
| Node.js: version too old | An old Node.js is first on PATH | Install Node 22+ (`nvm install 22 && nvm use 22`) |
| npm not found | Node installed without npm / PATH | Reinstall Node.js, open a new terminal |
| Packages: npm install failed | No registry access, or a broken install | Check internet/proxy, run `npm install` in that folder to see the error |
| Server/Client imports: missing … | Incomplete `node_modules` | `npm --prefix server install` / `npm --prefix client install`, or re-run without `--no-install` |
| MongoDB URI invalid | Typo in `server/.env` | `MONGODB_URI=mongodb://localhost:27017/inventory_poc` |
| MongoDB server: nothing listening | MongoDB not running / port closed | Start the MongoDB service (Windows Services, `brew services start mongodb-community`, `sudo systemctl start mongod`) or `node run.mjs --start-mongo` |
| MongoDB login: credentials rejected | Wrong user/password/authSource in the URI | Fix `MONGODB_URI`, or use the auth-less local URI |
| MongoDB login: host could not be resolved | Typo in the URI host | Correct `MONGODB_URI` |
| MongoDB login: did not answer | Port open but MongoDB still starting / another program | Wait and re-run, check in Compass |
| Seed failed | DB unreachable mid-run | Run `npm run seed` to see the full error |
| Ports: no free ports | Other dev servers are running | Stop them or set `PORT` in `server/.env` |
| Server/Client stopped | Crash during start-up | Read the `[server]` / `[client]` lines above (also in `run.log`) |

## Manual equivalent
```bash
cp server/.env.example server/.env      # set JWT_SECRET
cp client/.env.example client/.env
npm run install:all
npm run seed            # or npm run seed:demo
npm run dev             # API :5000 + client :5173
```
