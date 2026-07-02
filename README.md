# Mumbai Monsoon Watch

A single-page web app providing Mumbai commuters with a live, at-a-glance monsoon readout for today, including rain forecasts, local train status, waterlogged areas, and travel times.

It runs completely in the browser using Vanilla JS and CSS, backed by a Vercel Serverless Function that retrieves real-time weather and news updates, and queries a free open-source model (Llama 3 8B Instruct via OpenRouter) to compile the commute dashboard securely.

## Deployment Instructions

### Prerequisites
- A GitHub account.
- A Vercel account (free tier is perfect).
- An OpenRouter API key (available for free at [openrouter.ai](https://openrouter.ai)).

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
   - Key: `OPENROUTER_API_KEY`
   - Value: `[Paste your OpenRouter API key here]`
6. Click **Deploy**.

Vercel will build (copy) your static files and deploy the `/api/fetch-data.js` script as a Node.js serverless function automatically.

### Cost Note
Vercel's free tier covers this architecture comfortably. Since the app is configured to use OpenRouter's free-tier model (`meta-llama/llama-3-8b-instruct:free`), there is zero cost for LLM usage.
