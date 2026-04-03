# India Village Data API - Documentation

## Table of Contents
1. [Authentication](#authentication)
2. [Rate Limiting](#rate-limiting)
3. [Endpoints](#endpoints)
4. [Response Format](#response-format)
5. [Error Codes](#error-codes)
6. [Code Examples](#code-examples)

---

## Authentication

All API endpoints require authentication using an API key.

### How to Authenticate

Include your API key in the request header:

```http
X-API-Key: your_api_key_here
```

### Example Request

```bash
curl -X GET "https://api.example.com/api/states" \
  -H "X-API-Key: your_api_key_here"
```

---

## Rate Limiting

Rate limits depend on your subscription plan:

| Plan       | Requests/Minute | Requests/Day |
|------------|-----------------|--------------|
| Free       | 10              | 1,000        |
| Premium    | 100             | 50,000       |
| Pro        | 500             | 250,000      |
| Unlimited  | 10,000          | Unlimited    |

### Rate Limit Headers

Response headers include rate limit information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1643723400
```

---

## Endpoints

### 1. Get All States

Retrieve a list of all Indian states.

**Endpoint:** `GET /api/states`

**Response:**
```json
{
  "success": true,
  "count": 36,
  "data": [
    {
      "id": 1,
      "state_code": "01",
      "state_name": "Andaman and Nicobar Islands"
    },
    {
      "id": 2,
      "state_code": "02",
      "state_name": "Andhra Pradesh"
    }
  ]
}
```

---

### 2. Get Districts by State

Get all districts within a specific state.

**Endpoint:** `GET /api/states/:id/districts`

**Parameters:**
- `id` (path): State ID

**Example:**
```bash
GET /api/states/2/districts
```

**Response:**
```json
{
  "success": true,
  "count": 13,
  "data": [
    {
      "id": 15,
      "district_code": "002001",
      "district_name": "Anantapur",
      "state_name": "Andhra Pradesh"
    }
  ]
}
```

---

### 3. Get Sub-Districts by District

Get all sub-districts within a specific district.

**Endpoint:** `GET /api/districts/:id/sub-districts`

**Parameters:**
- `id` (path): District ID

**Example:**
```bash
GET /api/districts/15/sub-districts
```

**Response:**
```json
{
  "success": true,
  "count": 45,
  "data": [
    {
      "id": 150,
      "sub_district_code": "002001001",
      "sub_district_name": "Anantapur",
      "district_name": "Anantapur"
    }
  ]
}
```

---

### 4. Get Villages by Sub-District

Get all villages within a specific sub-district (paginated).

**Endpoint:** `GET /api/sub-districts/:id/villages`

**Parameters:**
- `id` (path): Sub-district ID
- `page` (query, optional): Page number (default: 1)
- `limit` (query, optional): Results per page (default: 50, max: 100)

**Example:**
```bash
GET /api/sub-districts/150/villages?page=1&limit=20
```

**Response:**
```json
{
  "success": true,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 234,
    "pages": 12
  },
  "data": [
    {
      "id": 1500,
      "village_name": "Agraharam",
      "pincode": "515001",
      "population": 3500,
      "sub_district_name": "Anantapur"
    }
  ]
}
```

---

### 5. Search Villages

Search for villages by name (supports partial matching).

**Endpoint:** `GET /api/search/villages`

**Parameters:**
- `q` (query, required): Search query (min 2 characters)
- `limit` (query, optional): Max results (default: 20, max: 100)

**Example:**
```bash
GET /api/search/villages?q=mumbai&limit=10
```

**Response:**
```json
{
  "success": true,
  "query": "mumbai",
  "count": 3,
  "data": [
    {
      "id": 42350,
      "village_name": "Mumbai",
      "pincode": "400001",
      "sub_district_name": "Mumbai City",
      "district_name": "Mumbai",
      "state_name": "Maharashtra",
      "full_address": "Mumbai, Mumbai City, Mumbai, Maharashtra, India"
    }
  ]
}
```

---

### 6. Get Complete Address

Get the full hierarchical address for a specific village.

**Endpoint:** `GET /api/address/:villageId`

**Parameters:**
- `villageId` (path): Village ID

**Example:**
```bash
GET /api/address/42350
```

**Response:**
```json
{
  "success": true,
  "data": {
    "village_id": 42350,
    "village_name": "Mumbai",
    "village_code": "27001001",
    "pincode": "400001",
    "sub_district_id": 2700,
    "sub_district_name": "Mumbai City",
    "district_id": 270,
    "district_name": "Mumbai",
    "state_id": 27,
    "state_name": "Maharashtra",
    "full_address": "Mumbai, Mumbai City, Mumbai, Maharashtra, India"
  }
}
```

---

### 7. Autocomplete

Fuzzy search for autocomplete functionality (uses trigram matching).

**Endpoint:** `GET /api/autocomplete`

**Parameters:**
- `q` (query, required): Search query (min 2 characters)
- `type` (query, optional): Type of entity ('state', 'district', 'village') - default: 'village'
- `limit` (query, optional): Max results (default: 10, max: 50)

**Example:**
```bash
GET /api/autocomplete?q=bangalor&type=village&limit=5
```

**Response:**
```json
{
  "success": true,
  "query": "bangalor",
  "type": "village",
  "count": 5,
  "data": [
    {
      "id": 12345,
      "name": "Bangalore",
      "full_address": "Bangalore, Bangalore Urban, Bangalore, Karnataka"
    },
    {
      "id": 12346,
      "name": "Bangalore North",
      "full_address": "Bangalore North, Bangalore Urban, Bangalore, Karnataka"
    }
  ]
}
```

---

## Response Format

### Success Response

All successful responses follow this structure:

```json
{
  "success": true,
  "data": { /* result data */ },
  "count": 10,  // Optional: number of results
  "pagination": { /* pagination info */ }  // For paginated endpoints
}
```

### Error Response

Error responses follow this structure:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message"
}
```

---

## Error Codes

| HTTP Code | Error Type            | Description                          |
|-----------|-----------------------|--------------------------------------|
| 400       | Bad Request           | Invalid parameters or query          |
| 401       | Unauthorized          | Missing or invalid API key           |
| 403       | Forbidden             | API key inactive or expired          |
| 404       | Not Found             | Resource not found                   |
| 429       | Too Many Requests     | Rate limit exceeded                  |
| 500       | Internal Server Error | Server error                         |

---

## Code Examples

### JavaScript (Fetch API)

```javascript
const API_KEY = 'your_api_key_here';
const BASE_URL = 'https://api.example.com';

async function searchVillages(query) {
  const response = await fetch(
    `${BASE_URL}/api/search/villages?q=${encodeURIComponent(query)}`,
    {
      headers: {
        'X-API-Key': API_KEY
      }
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

// Usage
searchVillages('mumbai')
  .then(result => console.log(result))
  .catch(error => console.error('Error:', error));
```

---

### Node.js (Axios)

```javascript
const axios = require('axios');

const API_KEY = 'your_api_key_here';
const BASE_URL = 'https://api.example.com';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-API-Key': API_KEY
  }
});

// Get all states
async function getStates() {
  try {
    const response = await api.get('/api/states');
    return response.data;
  } catch (error) {
    console.error('Error fetching states:', error.response?.data || error.message);
    throw error;
  }
}

// Search villages
async function searchVillages(query, limit = 20) {
  try {
    const response = await api.get('/api/search/villages', {
      params: { q: query, limit }
    });
    return response.data;
  } catch (error) {
    console.error('Error searching villages:', error.response?.data || error.message);
    throw error;
  }
}

// Get complete address
async function getAddress(villageId) {
  try {
    const response = await api.get(`/api/address/${villageId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching address:', error.response?.data || error.message);
    throw error;
  }
}
```

---

### Python (Requests)

```python
import requests

API_KEY = 'your_api_key_here'
BASE_URL = 'https://api.example.com'

headers = {
    'X-API-Key': API_KEY
}

# Get all states
def get_states():
    response = requests.get(f'{BASE_URL}/api/states', headers=headers)
    response.raise_for_status()
    return response.json()

# Search villages
def search_villages(query, limit=20):
    params = {'q': query, 'limit': limit}
    response = requests.get(
        f'{BASE_URL}/api/search/villages',
        headers=headers,
        params=params
    )
    response.raise_for_status()
    return response.json()

# Autocomplete
def autocomplete(query, entity_type='village', limit=10):
    params = {'q': query, 'type': entity_type, 'limit': limit}
    response = requests.get(
        f'{BASE_URL}/api/autocomplete',
        headers=headers,
        params=params
    )
    response.raise_for_status()
    return response.json()

# Usage
if __name__ == '__main__':
    # Search for villages
    results = search_villages('mumbai')
    print(f"Found {results['count']} villages")
    
    for village in results['data']:
        print(f"- {village['full_address']}")
```

---

### React Component (TypeScript)

```typescript
import React, { useState, useEffect } from 'react';

const API_KEY = 'your_api_key_here';
const BASE_URL = 'https://api.example.com';

interface Village {
  id: number;
  village_name: string;
  full_address: string;
  pincode: string;
}

const VillageSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Village[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const searchVillages = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${BASE_URL}/api/search/villages?q=${encodeURIComponent(query)}`,
          {
            headers: { 'X-API-Key': API_KEY }
          }
        );

        const data = await response.json();
        setResults(data.data || []);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchVillages, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  return (
    <div>
      <input
        type="text"
        placeholder="Search villages..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      
      {loading && <p>Loading...</p>}
      
      <ul>
        {results.map((village) => (
          <li key={village.id}>
            <strong>{village.village_name}</strong>
            <br />
            <small>{village.full_address}</small>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default VillageSearch;
```

---

### cURL Examples

```bash
# Get all states
curl -X GET "https://api.example.com/api/states" \
  -H "X-API-Key: your_api_key_here"

# Search villages
curl -X GET "https://api.example.com/api/search/villages?q=mumbai&limit=10" \
  -H "X-API-Key: your_api_key_here"

# Get address for village ID 42350
curl -X GET "https://api.example.com/api/address/42350" \
  -H "X-API-Key: your_api_key_here"

# Autocomplete search
curl -X GET "https://api.example.com/api/autocomplete?q=bangalor&type=village&limit=5" \
  -H "X-API-Key: your_api_key_here"

# Get districts in state ID 27
curl -X GET "https://api.example.com/api/states/27/districts" \
  -H "X-API-Key: your_api_key_here"
```

---

## Best Practices

### 1. Caching
Cache responses on the client side to reduce API calls:

```javascript
const cache = new Map();

async function getCachedData(url, ttl = 3600000) { // 1 hour TTL
  const cached = cache.get(url);
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  const data = await fetchFromAPI(url);
  cache.set(url, { data, timestamp: Date.now() });
  
  return data;
}
```

### 2. Error Handling
Always handle errors gracefully:

```javascript
try {
  const data = await searchVillages(query);
  // Handle success
} catch (error) {
  if (error.response?.status === 429) {
    // Rate limit exceeded
    console.log('Please wait before retrying');
  } else if (error.response?.status === 401) {
    // Invalid API key
    console.log('Please check your API key');
  } else {
    // Other errors
    console.log('An error occurred');
  }
}
```

### 3. Debouncing for Autocomplete
Debounce user input to avoid excessive API calls:

```javascript
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const debouncedSearch = debounce((query) => {
  searchVillages(query);
}, 300);
```

---

## Support

For questions or issues:
- Email: api-support@example.com
- Documentation: https://docs.example.com
- Status Page: https://status.example.com
