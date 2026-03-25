# Quick Commerce Backend API

A production-ready Node.js/Express backend for a quick commerce platform with multi-role authentication, product management, and category hierarchy.

## Features

- **Multi-Role Authentication**: Admin, Seller, Customer, Delivery Partner
- **JWT-based Security**: Secure token-based authentication
- **Product Management**: Full CRUD operations with image uploads
- **Category Hierarchy**: Header → Category → Subcategory structure
- **Image Hosting**: Cloudinary integration for image storage
- **Role-Based Access Control**: Fine-grained permission management
- **OTP Verification**: Phone-based OTP for customer/delivery auth
- **Seller Dashboard**: Sellers can manage their own products
- **Admin Panel**: Complete platform management

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 5.2.1
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer + Cloudinary
- **Password Hashing**: Bcrypt
- **Validation**: Joi
- **Environment**: Dotenv

## Project Structure

```
backend/
├── app/
│   ├── controller/          # Business logic
│   │   ├── adminAuthController.js
│   │   ├── sellerAuthController.js
│   │   ├── customerAuthController.js
│   │   ├── deliveryAuthController.js
│   │   ├── productController.js
│   │   └── categoryController.js
│   ├── models/              # Database schemas
│   │   ├── admin.js
│   │   ├── seller.js
│   │   ├── customer.js
│   │   ├── delivery.js
│   │   ├── product.js
│   │   └── category.js
│   ├── routes/              # API endpoints
│   │   ├── index.js
│   │   ├── adminAuth.js
│   │   ├── sellerAuth.js
│   │   ├── customerAuth.js
│   │   ├── deliveryAuth.js
│   │   ├── productRoutes.js
│   │   └── categoryRoutes.js
│   ├── middleware/          # Custom middleware
│   │   ├── authMiddleware.js
│   │   └── uploadMiddleware.js
│   ├── utils/               # Utility functions
│   │   ├── helper.js
│   │   ├── cloudinary.js
│   │   └── slugify.js
│   └── dbConfig/            # Database configuration
│       └── dbConfig.js
├── index.js                 # Entry point
├── .env.example             # Environment template
├── package.json             # Dependencies
├── render.yaml              # Render deployment config
├── QUICK_START.md           # Quick deployment guide
├── RENDER_DEPLOYMENT_GUIDE.md
├── DEPLOYMENT_CHECKLIST.md
└── README.md               # This file
```

## Installation

### Prerequisites
- Node.js 18+ and npm 9+
- MongoDB Atlas account
- Cloudinary account

### Local Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Start development server**
```bash
npm run dev
```

The API will be available at `http://localhost:7000`

## Environment Variables

```env
# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# JWT
JWT_SECRET=your_secure_secret_key_min_32_chars
JWT_EXPIRES_IN=7d

# Server
PORT=7000
NODE_ENV=development
HOSTNAME=localhost
FRONTEND_URL=http://localhost:5173
```

## API Documentation

### Authentication Endpoints

#### Customer Auth
```
POST   /api/customer/signup          - Send OTP
POST   /api/customer/login           - Send OTP
POST   /api/customer/verify-otp      - Verify OTP & get token
GET    /api/customer/profile         - Get profile (auth required)
PUT    /api/customer/profile         - Update profile (auth required)
```

#### Seller Auth
```
POST   /api/seller/signup            - Register seller
POST   /api/seller/login             - Login seller
GET    /api/seller/profile           - Get profile (auth required)
```

#### Admin Auth
```
POST   /api/admin/signup             - Register admin
POST   /api/admin/login              - Login admin
GET    /api/admin/profile            - Get profile (auth required)
```

#### Delivery Auth
```
POST   /api/delivery/signup          - Send OTP
POST   /api/delivery/login           - Send OTP
POST   /api/delivery/verify-otp      - Verify OTP & get token
GET    /api/delivery/profile         - Get profile (auth required)
PUT    /api/delivery/profile         - Update profile (auth required)
```

### Product Endpoints
```
GET    /api/products                 - Get all products (public)
GET    /api/products/:id             - Get product details (public)
GET    /api/products/seller/me       - Get seller's products (seller auth)
POST   /api/products                 - Create product (seller/admin auth)
PUT    /api/products/:id             - Update product (seller/admin auth)
DELETE /api/products/:id             - Delete product (seller/admin auth)
```

### Category Endpoints
```
GET    /api/admin/categories         - Get all categories (public)
POST   /api/admin/categories         - Create category (admin auth)
PUT    /api/admin/categories/:id     - Update category (admin auth)
DELETE /api/admin/categories/:id     - Delete category (admin auth)
```

### Health Check
```
GET    /health                       - Health check endpoint
GET    /                             - Welcome endpoint
```

## Authentication

### JWT Token Format
```
Authorization: Bearer <token>
```

### Token Payload
```json
{
  "id": "user_id",
  "role": "seller|admin|customer|delivery",
  "iat": 1234567890,
  "exp": 1234654290
}
```

## Request/Response Format

### Success Response
```json
{
  "success": true,
  "error": false,
  "message": "Operation successful",
  "result": { /* data */ }
}
```

### Error Response
```json
{
  "success": false,
  "error": true,
  "message": "Error description"
}
```

## Deployment

### Quick Deploy to Render

1. **Prepare repository**
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

2. **Deploy on Render**
   - Go to [render.com](https://render.com)
   - Connect GitHub repository
   - Add environment variables
   - Deploy

See [QUICK_START.md](./QUICK_START.md) for detailed instructions.

### Production Checklist
- [ ] All environment variables configured
- [ ] MongoDB Atlas cluster created
- [ ] Cloudinary account set up
- [ ] JWT_SECRET is strong (min 32 chars)
- [ ] CORS configured for frontend domain
- [ ] Database backups enabled
- [ ] Error logging configured
- [ ] Rate limiting implemented
- [ ] SSL/TLS enabled

## Development

### Running Tests
```bash
npm test
```

### Code Style
- Use ES6+ syntax
- Follow Express.js best practices
- Use async/await for async operations
- Implement proper error handling

### Adding New Features
1. Create model in `app/models/`
2. Create controller in `app/controller/`
3. Create routes in `app/routes/`
4. Add routes to `app/routes/index.js`
5. Test with Postman/curl

## Security Best Practices

- ✅ Passwords hashed with bcrypt
- ✅ JWT tokens for authentication
- ✅ Role-based access control
- ✅ CORS configured
- ✅ Environment variables for secrets
- ✅ Input validation with Joi
- ✅ Error messages don't leak sensitive info
- ⚠️ TODO: Rate limiting on auth endpoints
- ⚠️ TODO: Request logging and monitoring
- ⚠️ TODO: SMS provider integration

## Performance Optimization

### Current
- Connection pooling configured
- Mongoose query optimization
- Cloudinary CDN for images
- Memory storage for file uploads

### Recommended
- Add Redis caching
- Implement pagination
- Add database indexes
- Optimize queries
- Implement request compression

## Troubleshooting

### MongoDB Connection Error
```
Error: connect ECONNREFUSED
Solution: Check MONGO_URI, verify IP whitelist in MongoDB Atlas
```

### Cloudinary Upload Fails
```
Error: Upload failed
Solution: Verify API credentials, check file size limit (5MB)
```

### JWT Token Invalid
```
Error: Invalid or expired token
Solution: Verify JWT_SECRET, check token expiration
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

ISC

## Support

- **Documentation**: See QUICK_START.md and RENDER_DEPLOYMENT_GUIDE.md
- **Issues**: Create an issue in the repository
- **Email**: support@quickcommerce.com

## Roadmap

- [ ] SMS integration (Twilio/AWS SNS)
- [ ] Payment gateway integration
- [ ] Order management system
- [ ] Real-time notifications
- [ ] Analytics dashboard
- [ ] Advanced search and filters
- [ ] Recommendation engine
- [ ] Mobile app API optimization

---

**Version**: 1.0.0  
**Last Updated**: January 2024  
**Status**: Production Ready
