# Backend Architecture & System Design

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│              (http://localhost:5173)                         │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/HTTPS
                         │ REST API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express.js Server                          │
│              (Render.com Deployment)                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐   │
│  │              CORS Middleware                         │   │
│  │  (Handles cross-origin requests from frontend)      │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Authentication Middleware                  │   │
│  │  (JWT verification, Role-based access control)      │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Upload Middleware (Multer)               │   │
│  │  (File upload handling, validation)                 │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Route Handlers                          │   │
│  │  ├─ /api/customer/*                                 │   │
│  │  ├─ /api/seller/*                                   │   │
│  │  ├─ /api/admin/*                                    │   │
│  │  ├─ /api/delivery/*                                 │   │
│  │  ├─ /api/products/*                                 │   │
│  │  └─ /api/admin/categories/*                         │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Controllers (Business Logic)              │   │
│  │  ├─ customerAuthController.js                       │   │
│  │  ├─ sellerAuthController.js                         │   │
│  │  ├─ adminAuthController.js                          │   │
│  │  ├─ deliveryAuthController.js                       │   │
│  │  ├─ productController.js                            │   │
│  │  └─ categoryController.js                           │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Utilities                               │   │
│  │  ├─ helper.js (Response formatting)                 │   │
│  │  ├─ cloudinary.js (Image upload)                    │   │
│  │  └─ slugify.js (URL slug generation)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐          ┌──────────┐        ┌──────────┐
    │ MongoDB │          │Cloudinary│        │   JWT    │
    │ Atlas   │          │  (CDN)   │        │ Tokens   │
    │         │          │          │        │          │
    │ Models: │          │ Stores:  │        │ Signing: │
    │ ├─Admin │          │ ├─Product│        │ JWT_     │
    │ ├─Seller│          │ │ Images │        │ SECRET   │
    │ ├─Cust. │          │ ├─Category│       │          │
    │ ├─Deliv.│          │ │ Images │        │ Verify:  │
    │ ├─Prod. │          │ └─Gallery│        │ Bearer   │
    │ └─Categ.│          │          │        │ Token    │
    └─────────┘          └──────────┘        └──────────┘
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User Request                             │
│              (e.g., POST /api/products)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  CORS Middleware       │
            │  Check origin          │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Body Parser           │
            │  Parse JSON/Form       │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Auth Middleware       │
            │  Verify JWT Token      │
            │  Check User Role       │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Upload Middleware     │
            │  (if file upload)      │
            │  Validate files        │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Route Handler         │
            │  Match endpoint        │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Controller            │
            │  Business Logic        │
            │  Validate Input        │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Cloudinary Upload     │
            │  (if images)           │
            │  Get secure URLs       │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Database Query        │
            │  Create/Update/Delete  │
            │  Mongoose Operation    │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Response Handler      │
            │  Format Response       │
            │  Sanitize Data         │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Send Response         │
            │  JSON with Status      │
            └────────────┬───────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Client Response                          │
│              (JSON with success/error)                      │
└─────────────────────────────────────────────────────────────┘
```

## Authentication Flow

```
┌──────────────────────────────────────────────────────────┐
│                  CUSTOMER/DELIVERY AUTH                  │
└──────────────────────────────────────────────────────────┘

1. SIGNUP (Send OTP)
   ┌─────────────────────────────────────────┐
   │ POST /api/customer/signup               │
   │ Body: { name, phone }                   │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Generate OTP (4 digits)                 │
   │ Save to DB with 5min expiry             │
   │ TODO: Send via SMS                      │
   │ Currently: Log to console               │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Response: "OTP sent successfully"       │
   └─────────────────────────────────────────┘

2. VERIFY OTP
   ┌─────────────────────────────────────────┐
   │ POST /api/customer/verify-otp           │
   │ Body: { phone, otp }                    │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Find user with matching phone & OTP     │
   │ Check OTP expiry                        │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Mark as verified                        │
   │ Clear OTP from DB                       │
   │ Generate JWT Token                      │
   │ Payload: { id, role, exp }              │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Response: { token, user }               │
   │ Client stores token in localStorage     │
   └─────────────────────────────────────────┘

3. AUTHENTICATED REQUEST
   ┌─────────────────────────────────────────┐
   │ GET /api/customer/profile               │
   │ Header: Authorization: Bearer <token>   │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Auth Middleware                         │
   │ Extract token from header               │
   │ Verify signature with JWT_SECRET        │
   │ Check expiry                            │
   │ Attach user to req.user                 │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Controller receives authenticated user  │
   │ Fetch and return user profile           │
   └─────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  SELLER/ADMIN AUTH                       │
└──────────────────────────────────────────────────────────┘

1. SIGNUP
   ┌─────────────────────────────────────────┐
   │ POST /api/seller/signup                 │
   │ Body: { name, email, phone, password }  │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Validate input                          │
   │ Check email/phone not exists            │
   │ Hash password with bcrypt               │
   │ Create user in DB                       │
   │ Generate JWT token                      │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Response: { token, user }               │
   └─────────────────────────────────────────┘

2. LOGIN
   ┌─────────────────────────────────────────┐
   │ POST /api/seller/login                  │
   │ Body: { email, password }               │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Find user by email                      │
   │ Compare password with bcrypt            │
   │ Generate JWT token                      │
   └────────────┬────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────┐
   │ Response: { token, user }               │
   └─────────────────────────────────────────┘
```

## Role-Based Access Control (RBAC)

```
┌─────────────────────────────────────────────────────────┐
│                    ROLES & PERMISSIONS                  │
└─────────────────────────────────────────────────────────┘

ADMIN
├─ Create/Update/Delete Categories
├─ Create/Update/Delete Products (any seller)
├─ View all users
├─ View analytics
└─ System management

SELLER
├─ Create/Update/Delete own products
├─ View own products
├─ View own orders
├─ Manage shop profile
└─ View earnings

CUSTOMER
├─ View products
├─ View categories
├─ Create orders
├─ View order history
└─ Manage profile

DELIVERY
├─ View assigned orders
├─ Update delivery status
├─ View earnings
└─ Manage profile

┌─────────────────────────────────────────────────────────┐
│              MIDDLEWARE FLOW                            │
└─────────────────────────────────────────────────────────┘

Request
  │
  ▼
verifyToken()
  │ Extract & verify JWT
  │ Attach user to req.user
  ▼
allowRoles("seller", "admin")
  │ Check if user.role in allowed roles
  │ Return 403 if not authorized
  ▼
Controller
  │ Execute business logic
  ▼
Response
```

## Database Schema Relationships

```
┌──────────────────────────────────────────────────────────┐
│                   DATABASE SCHEMA                        │
└──────────────────────────────────────────────────────────┘

ADMIN
├─ _id (ObjectId)
├─ name (String)
├─ email (String, unique)
├─ phone (String, unique)
├─ password (String, hashed)
├─ role (String: "admin")
├─ isVerified (Boolean)
├─ lastLogin (Date)
├─ createdAt (Date)
└─ updatedAt (Date)

SELLER
├─ _id (ObjectId)
├─ name (String)
├─ email (String, unique)
├─ phone (String, unique)
├─ password (String, hashed)
├─ shopName (String)
├─ role (String: "seller")
├─ isVerified (Boolean)
├─ isActive (Boolean)
├─ lastLogin (Date)
├─ createdAt (Date)
└─ updatedAt (Date)

CUSTOMER
├─ _id (ObjectId)
├─ name (String)
├─ email (String, unique, sparse)
├─ phone (String, unique)
├─ password (String, optional)
├─ role (String: "user")
├─ isVerified (Boolean)
├─ otp (String, select: false)
├─ otpExpiry (Date, select: false)
├─ addresses (Array)
│  ├─ label (String: "home"|"work"|"other")
│  ├─ fullAddress (String)
│  ├─ landmark (String)
│  ├─ city (String)
│  ├─ state (String)
│  ├─ pincode (String)
│  └─ location (Object: {lat, lng})
├─ walletBalance (Number)
├─ isActive (Boolean)
├─ lastLogin (Date)
├─ createdAt (Date)
└─ updatedAt (Date)

DELIVERY
├─ _id (ObjectId)
├─ name (String)
├─ phone (String, unique)
├─ vehicleType (String: "bike"|"cycle"|"scooter")
├─ vehicleNumber (String)
├─ currentArea (String)
├─ isVerified (Boolean)
├─ isOnline (Boolean)
├─ role (String: "delivery")
├─ otp (String, select: false)
├─ otpExpiry (Date, select: false)
├─ lastLogin (Date)
├─ createdAt (Date)
└─ updatedAt (Date)

CATEGORY
├─ _id (ObjectId)
├─ name (String)
├─ slug (String, unique)
├─ description (String)
├─ image (String, Cloudinary URL)
├─ iconId (String, SVG identifier)
├─ status (String: "active"|"inactive")
├─ type (String: "header"|"category"|"subcategory")
├─ parentId (ObjectId, ref: Category)
├─ children (Virtual, ref: Category)
├─ createdAt (Date)
└─ updatedAt (Date)

PRODUCT
├─ _id (ObjectId)
├─ name (String)
├─ slug (String, unique)
├─ sku (String, unique)
├─ description (String)
├─ price (Number)
├─ salePrice (Number)
├─ stock (Number)
├─ lowStockAlert (Number)
├─ brand (String)
├─ weight (String)
├─ tags (Array of String)
├─ mainImage (String, Cloudinary URL)
├─ galleryImages (Array of String, Cloudinary URLs)
├─ headerId (ObjectId, ref: Category)
├─ categoryId (ObjectId, ref: Category)
├─ subcategoryId (ObjectId, ref: Category)
├─ sellerId (ObjectId, ref: Seller)
├─ status (String: "active"|"inactive")
├─ variants (Array)
│  ├─ name (String)
│  ├─ price (Number)
│  ├─ salePrice (Number)
│  ├─ stock (Number)
│  └─ sku (String)
├─ isFeatured (Boolean)
├─ createdAt (Date)
└─ updatedAt (Date)

RELATIONSHIPS:
Product.sellerId → Seller._id
Product.headerId → Category._id
Product.categoryId → Category._id
Product.subcategoryId → Category._id
Category.parentId → Category._id
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  RENDER DEPLOYMENT                      │
└─────────────────────────────────────────────────────────┘

GitHub Repository
  │
  │ (Push to main)
  │
  ▼
Render.com
  │
  ├─ Build Phase
  │  ├─ npm install
  │  └─ Verify dependencies
  │
  ├─ Deploy Phase
  │  ├─ Start: npm start
  │  ├─ Listen on PORT (10000)
  │  └─ Health check: /health
  │
  └─ Running Service
     ├─ Auto-restart on crash
     ├─ SSL/TLS enabled
     ├─ Environment variables loaded
     └─ Logs available in dashboard

Environment Variables (Render Dashboard)
├─ MONGO_URI → MongoDB Atlas
├─ CLOUDINARY_* → Cloudinary API
├─ JWT_SECRET → Token signing
├─ NODE_ENV → production
└─ FRONTEND_URL → CORS origin

External Services
├─ MongoDB Atlas (Database)
├─ Cloudinary (Image CDN)
└─ Render (Hosting)
```

## Performance Optimization

```
┌─────────────────────────────────────────────────────────┐
│              OPTIMIZATION STRATEGIES                    │
└─────────────────────────────────────────────────────────┘

DATABASE
├─ Connection Pooling (10 max, 5 min)
├─ Query Optimization
├─ Indexes on frequently queried fields
└─ Pagination for list endpoints

CACHING
├─ Cloudinary CDN for images
├─ Browser caching headers
└─ TODO: Redis for session/cache

API
├─ Request compression
├─ Response formatting
├─ Error handling
└─ TODO: Rate limiting

DEPLOYMENT
├─ Render auto-scaling
├─ Health checks
├─ Graceful shutdown
└─ TODO: Load balancing
```

---

**Architecture Version**: 1.0  
**Last Updated**: January 2024  
**Status**: Production Ready
