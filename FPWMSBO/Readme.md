# Cohort online market place

---

# MERN Marketplace – Microservices

**Stack**: MongoDB Atlas, Express/Node, React (Vite + RTK Query), RabbitMQ, Redis, Razorpay.
**Deploy**: ECR → ECS Fargate → ALB (path rules) → Target Groups.
**Auth**: JWT (access+refresh, httpOnly), Google (Passport).
**Security**: Helmet, CORS, CSRF (double-submit), XSS sanitize, rate limit (Redis), RBAC.
**Observability**: Morgan + Pino, request-id, CloudWatch.

---

## 1) API Endpoints by Service (2–3 line descriptions)

> All routes are versioned implicitly as v1 via base path (e.g., /products). Add x-request-id for correlation. Validation via express-validator/zod. Descriptions note auth and idempotency when relevant.

### 1.1 Auth Service

- **POST `/auth/register`** – Create account as USER or SELLER. Validates email uniqueness, hashes password, issues refresh+access tokens. Emits `user.created`.
- **POST `/auth/login`** – Email+password login. On success: httpOnly refresh cookie + short-lived access token in body; logs device metadata.
- **POST `/auth/logout`** – Revokes current refresh session, clears cookies. Idempotent.
- **GET `/auth/me`** – Returns current user (id, roles, profile). Requires valid access token.
- **PATCH `/auth/users/me`** – Update profile fields; server-side sanitize HTML. Emits `user.updated` for analytics.
- **GET `/auth/users/me/addresses`** – List saved addresses; mark default.
- **POST `/auth/users/me/addresses`** – Add address (with validation for pincode/phone).
- **DELETE `/auth/users/me/addresses/:addressId`** – Remove address.

### 1.2 Product Service

- **GET `/products`** – Catalog listing with search (`q` text index), filters (category, price range), pagination, sort.
- **GET `/products/:id`** – Product details, images, seller info (via populate). Cacheable by id.
- **POST `/products`** (SELLER) – Create product; validates title/price; seeds base variant if none. Emits `product.created`.
- **PATCH `/products/:id`** (SELLER) – Update product fields; invalidates caches; emits `product.updated`.
- **DELETE `/products/:id`** (SELLER) – Soft delete (status=`archived`) or hard delete if no orders. Emits `product.deleted`.
- **GET `/products/seller`** (SELLER) – seller’s product list

### 1.3 Cart Service

- **GET `/cart`** – Fetch current cart (items, totals). Recomputes prices from Product Service to avoid tampering.
- **POST `/cart/items`** – Add `{ productId, qty }`. Validates availability; reserves soft stock optionally.
- **PATCH `/cart/items/:productId`** – Change quantity; removes if qty ≤ 0. Returns recalculated totals.
- **DELETE `/cart/items/:productId`** – Remove line.
- **DELETE `/cart`** – Clear cart.

### 1.4 Order Service

- **POST `/orders`** – Create order from current cart: copies priced items, computes taxes/shipping, sets `status=pending`, reserves inventory. Emits `order.created`.
- **GET `/orders/:id`** – Get order by id with timeline and payment summary.
- **GET `/orders/me`** – Paginated list of the customer’s orders.
- **POST `/orders/:id/cancel`** – Buyer-initiated cancel while `pending`/`paid` rules apply
- **PATCH `/orders/:id/address`** – update delivery address prior to payment capture.

### 1.5 Payment Service (Razorpay)

- **POST `/payments/razorpay/order`** – Creates Razorpay Order from server-side totals (amount, currency, receipt). Returns `{orderId, keyId}`. Idempotent per cart.
- **GET `/payments/:id`** – Fetch payment record (status, gateway payload). RBAC: buyer or admin.
- **POST `/payments/verify` - Verify the payment with paymentID,orderID and signature.**

### 1.7 Notification Service

- Listen to events, send emails, track delivery status

### 1.8 AI Buddy Service

- Acts like a personal shopping assistant.
- Parses natural language queries (“Find me red sneakers under ₹2000”) → queries Product Service.
- Can also create a Cart on behalf of the user.

### 1.9 Seller Dashboard (3)

- GET /seller/dashboard/metrics → Sales, revenue, top products.
- GET /seller/dashboard/orders → Seller’s orders.
- GET /seller/dashboard/products → Seller’s product inventory & low stock alerts.

---

# **Entities & Schemas**

## **1. User Entity**

Represents an application user (customer or admin).

```jsx
{
  "userId": "string (UUID)",
  "name": "string",
  "email": "string (unique)",
  "passwordHash": "string",
  "role": "enum: ['customer', 'admin']",
  "address": [
    {
      "addressId": "string (UUID)",
      "street": "string",
      "city": "string",
      "state": "string",
      "country": "string",
      "zipCode": "string",
      "isDefault": "boolean"
    }
  ],
  "createdAt": "date",
  "updatedAt": "date"
}
```

---

## **2. Product Entity**

Represents products available in the store.

```jsx
{
  "productId": "string (UUID)",
  "name": "string",
  "description": "string",
  "price": "number",
  "category": "string",
  "stock": "number",
  "images": ["string (URL)"],
  "createdAt": "date",
  "updatedAt": "date"
}
```

---

## **3. Cart Entity**

Represents a user’s shopping cart.

```jsx
{
  "cartId": "string (UUID)",
  "userId": "string (FK → User.userId)",
  "items": [
    {
      "productId": "string (FK → Product.productId)",
      "quantity": "number",
    }
  ],
  "totalAmount": "number",
  "updatedAt": "date"
}
```

---

## **4. Order Entity**

Represents placed orders.

```jsx
{
  "orderId": "string (UUID)",
  "userId": "string (FK → User.userId)",
  "items": [
    {
      "productId": "string (FK → Product.productId)",
      "quantity": "number",
      "price": "number"
    }
  ],
  "totalAmount": "number",
  "status": "enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']",
  "shippingAddress": {
    "street": "string",
    "city": "string",
    "state": "string",
    "country": "string",
    "zipCode": "string"
  },
  "createdAt": "date",
  "updatedAt": "date"
}
```

---

## **5. Payment Entity**

Tracks payment transactions.

```jsx
{
  "paymentId": "string (UUID)",
  "orderId": "string (FK → Order.orderId)",
  "userId": "string (FK → User.userId)",
  "amount": "number",
  "method": "enum: ['credit_card', 'debit_card', 'upi', 'paypal', 'cod']",
  "status": "enum: ['pending', 'completed', 'failed', 'refunded']",
  "transactionId": "string",
  "createdAt": "date"
}
```

---

## **6. Notification Entity**

Stores user notifications (email, SMS, in-app).

```jsx
{
  "notificationId": "string (UUID)",
  "userId": "string (FK → User.userId)",
  "type": "enum: ['email', 'sms', 'push']",
  "message": "string",
  "status": "enum: ['pending', 'sent', 'failed']",
  "createdAt": "date"
}
```

---

## **7. Review Entity**

(Optional but common in e-commerce).

```jsx
{
  "reviewId": "string (UUID)",
  "productId": "string (FK → Product.productId)",
  "userId": "string (FK → User.userId)",
  "rating": "number (1-5)",
  "comment": "string",
  "createdAt": "date"
}
```

---

# **Final Entity Count**

- **User**
- **Product**
- **Cart**
- **Order**
- **Payment**
- **Notification**

---

# **Service–Entity Mapping Table**

| **Service**              | **Entities Owned**            | **Responsibilities**                                                                                | **Dependencies**                  | **RabbitMQ Events**                                                   |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| **Auth/User Service**    | User                          | Register/login, issue tokens, manage profiles & addresses, emit USER_CREATED/UPDATED                | Needed by all services (for auth) | Emits user.created, user.updated                                      |
| **Product Service**      | Product (and optional Review) | CRUD products, manage stock, serve product data to Cart/Order, emit PRODUCT_CREATED/UPDATED/DELETED | Cart, Order, Review Service       | Emits product.created, product.updated                                |
| **Cart Service**         | Cart                          | Add/remove items, validate stock/price, compute totals, maintain one cart per user                  | Product Service (for price/stock) | Subscribes to product.updated (optional)                              |
|  |
| **Order Service**        | Order                         | Create/manage orders, track lifecycle, reserve inventory, emit ORDER_CREATED/UPDATED                | Cart, Payment, Notification       | Emits order.created, order.cancelled                                  |
| **Payment Service**      | Payment                       | Handle Razorpay/Stripe integration, verify payments, emit PAYMENT_SUCCESS/FAILED                    | Order, Notification               | Emits payment.success, payment.failed                                 |
| **Notification Service** | Notification                  | Listen to events, send emails/SMS/push, track delivery status                                       | User, Order, Payment              | Subscribes to all major events (order.created, payment.success, etc.) |

| **Seller Dashboard Service**
| Aggregated seller metrics & insights | /seller/dashboard/metrics, /seller/dashboard/orders, /seller/dashboard/products
| | Subscribes to order.created, payment.success, product.updated
|

---
