# Backend Deployment Guide for Render

## Overview
This guide provides step-by-step instructions to deploy the Quick Commerce backend on Render.com with production-ready configurations.

## Prerequisites
- Render.com account (free tier available)
- MongoDB Atlas account (free tier available)
- Cloudinary account (free tier available)
- GitHub repository with backend code

## Step 1: Prepare Environment Variables

Create a `.env.production` file with the following variables:

```env
# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# JWT
JWT_SECRET=your_secure_random_secret_key_min_32_chars
JWT_EXPIRES_IN=7d

# Server
PORT=10000
NODE_ENV=production
HOSTNAME=0.0.0.0

# Optional: SMS Provider (for future implementation)
# TWILIO_ACCOUNT_SID=your_sid
# TWILIO_AUTH_TOKEN=your_token
# TWILIO_PHONE_NUMBER=+1234567890
```

## Step 2: Update package.json

Ensure your `package.json` has the correct start script:

```json
{
  "scripts": {
    "dev": "nodemon index.js",
    "start": "node index.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

## Step 3: Create Render Configuration

Create `render.yaml` in the root directory:

```yaml
services:
  - type: web
    name: quick-commerce-api
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
```

## Step 4: Deploy on Render

### Option A: Using Render Dashboard

1. Go to [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: quick-commerce-api
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or Starter for production)

5. Add Environment Variables:
   - Click "Advanced" → "Add Environment Variable"
   - Add all variables from `.env.production`

6. Click "Create Web Service"

### Option B: Using render.yaml

1. Push `render.yaml` to your repository
2. Go to Render Dashboard
3. Click "New +" → "Web Service"
4. Select your repository
5. Render will auto-detect `render.yaml` configuration
6. Add environment variables in dashboard
7. Deploy

## Step 5: Configure MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster (free tier available)
3. Create a database user with strong password
4. Whitelist Render IP:
   - Go to Network Access
   - Add IP Address: `0.0.0.0/0` (or specific Render IP)
5. Get connection string and add to Render environment variables

## Step 6: Verify Deployment

After deployment, test the API:

```bash
# Health check
curl https://your-app.onrender.com/

# Expected response: "Hello, World!"
```

## Step 7: Monitor & Logs

- View logs in Render Dashboard → Logs tab
- Check for MongoDB connection errors
- Verify Cloudinary credentials are working

## Production Checklist

- [ ] Environment variables set in Render
- [ ] MongoDB connection string verified
- [ ] Cloudinary credentials configured
- [ ] JWT_SECRET is strong (min 32 characters)
- [ ] NODE_ENV set to "production"
- [ ] CORS configured for frontend domain
- [ ] Rate limiting implemented
- [ ] Error logging configured
- [ ] Database backups enabled
- [ ] SSL/TLS enabled (automatic on Render)

## Troubleshooting

### MongoDB Connection Error
- Check MONGO_URI format
- Verify IP whitelist in MongoDB Atlas
- Ensure database user has correct permissions

### Cloudinary Upload Fails
- Verify API credentials
- Check file size limits (5MB default)
- Ensure folder permissions in Cloudinary

### Port Issues
- Render assigns PORT dynamically
- Use `process.env.PORT` in code (already done)
- Don't hardcode port numbers

### Cold Start Issues
- Free tier has 15-minute inactivity timeout
- Upgrade to Starter plan for production
- Implement health check endpoint

## Scaling Recommendations

1. **Database**: Upgrade MongoDB Atlas to paid tier for better performance
2. **Server**: Upgrade Render plan from Free to Starter/Standard
3. **Caching**: Add Redis for session/cache management
4. **CDN**: Use Cloudinary CDN for image delivery
5. **Monitoring**: Integrate Sentry for error tracking

## Security Best Practices

1. Never commit `.env` files to repository
2. Use strong JWT_SECRET (min 32 characters)
3. Implement rate limiting on auth endpoints
4. Add request validation with Joi
5. Enable HTTPS (automatic on Render)
6. Regularly rotate API keys
7. Monitor logs for suspicious activity
8. Keep dependencies updated

## Maintenance

### Regular Tasks
- Monitor API performance
- Check error logs weekly
- Update dependencies monthly
- Review database usage
- Backup important data

### Updating Code
1. Push changes to GitHub
2. Render auto-deploys on push (if configured)
3. Monitor deployment logs
4. Verify API functionality

## Support & Resources

- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas Guide](https://docs.atlas.mongodb.com/)
- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
