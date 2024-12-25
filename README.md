# API Pagination Error Handler

A React-based dashboard that demonstrates advanced error handling and retry mechanisms for paginated API requests, implementing AWS's recommended practices for exponential backoff and jitter.

## Features

- 🔄 **Exponential Backoff with Jitter**
- 🪣 **Token Bucket Rate Limiting**
- 📊 **Real-time Request Monitoring**
- 📈 **Performance Metrics**
- 🔍 **Request History Tracking**
- 🎯 **Retry Queue Management**

## Technologies

- React 18
- TypeScript
- Tailwind CSS
- Vite
- Lucide Icons
- Radix UI Components

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/api-pagination-error-handler.git
   ```

2. **Navigate to project directory:**
   ```bash
   cd api-pagination-error-handler/api-handler
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser and visit:**
   [http://localhost:5173](http://localhost:5173)

## Implementation Details

### Token Bucket Algorithm
- **Maximum bucket size:** 10 tokens
- **Refill rate:** 2 tokens per second
- **Purpose:** Prevents request bursts while allowing short-term spikes

### Exponential Backoff Strategy
- **Initial delay:** 1000ms
- **Maximum delay:** 32000ms
- **Implementation:** Full jitter
- **Benefit:** Prevents thundering herd problem

### Error Handling
- Request timeouts
- Rate limiting
- Network failures
- API errors
- Retry queue management

## Project Structure

```plaintext
api-handler/
├── src/
│   ├── components/
│   │   └── ui/  # Reusable UI components
│   ├── App.tsx  # Main application component
│   └── main.tsx # Entry point
├── public/
└── package.json
```

## Configuration

Key constants can be adjusted in `App.tsx`:

```typescript
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 32000; // 32 seconds
const MAX_RETRIES = 5;         // Maximum retry attempts
const TOKEN_BUCKET_RATE = 2;   // Tokens per second
const TOKEN_BUCKET_SIZE = 10;  // Maximum tokens
```

## References

- [AWS Builder's Library - Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [AWS Architecture Blog - Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

## Contributing

1. **Fork the repository**
2. **Create your feature branch:**
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit your changes:**
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. **Push to the branch:**
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Open a Pull Request**

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- AWS Builder's Library for retry strategy best practices
- React team for the amazing framework
- Tailwind CSS for the utility-first CSS framework
