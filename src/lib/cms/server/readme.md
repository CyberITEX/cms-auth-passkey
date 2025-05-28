# Appwrite Module Structure

This document explains the organization of the Appwrite utilities. The original `appwrite.js` file has been refactored into multiple modules for better maintainability.

## Directory Structure

```
src/lib/server/appwrite/
├── client.js       # Appwrite client factory functions
├── customers.js    # User/customer management functions
├── products.js     # Product-related CRUD operations
├── categories.js   # Category-related CRUD operations
├── tags.js         # Tag-related CRUD operations
├── plans.js        # Plan management and retrieval functions
├── pricing.js      # Pricing and downloadable file management
└── index.js        # Exports all functions from the modules above
```

## Module Descriptions

### client.js
Contains the Appwrite client initialization, shared services (databases, users), and constants.

### customers.js
Functions for managing and retrieving customer information from Appwrite Users API.

### products.js
CRUD operations for product management, including retrieving products by slug.

### categories.js
Functions for managing product categories.

### tags.js
Functions for managing product tags.

### plans.js
Plan management functionality, including creating, updating, and retrieving plans with related data.

### pricing.js
Functions for pricing options and downloadable files management.

### index.js
Central export point that re-exports all functions from the other modules.

## Usage

Instead of importing from a single large file, you can now:

1. Import everything from the index file:
```javascript
import { getProducts, createPlan, getPricingById } from '@/lib/server/appwrite';
```

2. Or import specific functions from specific modules:
```javascript
import { getProducts } from '@/lib/server/appwrite/products';
import { createPlan } from '@/lib/server/appwrite/plans';
```

The first approach maintains backward compatibility while the second approach may provide better code readability and smaller bundle sizes.