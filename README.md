# Mumbai Monsoon Watch

A single-page web app providing Mumbai commuters with a live, at-a-glance monsoon readout for today, including rain forecasts, local train status, waterlogged areas, and travel times.

It runs completely in the browser using Vanilla JS and CSS, backed by a Vercel Serverless Function proxying requests to the Google Gemini API (gemini-2.5-pro) to ensure API keys remain secure.

## Deployment Instructions

### Prerequisites
- A GitHub account.
- A Vercel account (free tier is perfect).
- A Google Gemini API key.

### Step 1: Push to GitHub
1. Create a new repository on GitHub.
2. Initialize git in this folder, commit all files, and push to your new GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

### Step 2: Deploy on Vercel
1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New** -> **Project**.
3. Import your GitHub repository.
4. Vercel will automatically detect that this is a static site with an `/api` folder. You do **not** need a build command (leave it empty or as default).
5. Open the **Environment Variables** section before deploying.
   - Key: `GEMINI_API_KEY`
   - Value: `[Paste your Gemini API key here]`
6. Click **Deploy**.

Vercel will build (copy) your static files and deploy the `/api/fetch-data.js` script as a Node.js serverless function automatically.

### Cost Note
Vercel's free tier covers this architecture comfortably. The only cost you might incur is for the Gemini API tokens if usage is very high, but for personal or small community use, the free tier of Gemini API is usually more than sufficient.
