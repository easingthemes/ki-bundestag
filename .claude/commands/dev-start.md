Start the dev environment:
1. Check if ports 3001 and 5173 are already in use (`lsof -i :3001` and `lsof -i :5173`)
2. If either is in use, ask if the user wants to kill existing processes first
3. Run `npm run dev:api` in the background
4. Run `npm run dev:web` in the background
5. Wait a few seconds, then verify both servers are responding
6. Summarize: API on :3001, Web on :5173