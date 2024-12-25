import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle, 
  RefreshCcw, 
  CheckCircle2, 
  XCircle 
} from 'lucide-react'

interface Article {
  id: number
  title: string
  content: string
}

interface ApiResponse {
  data: Article[]
  is_next: boolean
  page: number
  per_page: number
}

interface ErrorResponse {
  error: string
}

interface PageAttempt {
  pageNum: number
  status: 'success' | 'error'
  timestamp: number
  statusCode?: number
}

interface PageData {
  pageNum: number
  content: ApiResponse | ErrorResponse
  status: 'success' | 'error'
  attempts: number
  lastAttemptTime?: number
}

interface RetryMetrics {
  timestamp: number
  delay: number
  pageNum: number
  attempt: number
  statusCode?: number
}

interface PerformanceStats {
  totalRequests: number
  preventedImmediateRetries: number
  totalBackoffTime: number
  averageBackoffTime: number
  maxBackoffTime: number
  retryDistribution: Map<number, number> // page number -> retry count
}

// Constants for retry configuration
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 32000;    // 32 seconds
const MAX_RETRIES = 5;
const REQUEST_TIMEOUT = 5000;     // 5 seconds timeout
const TOKEN_BUCKET_RATE = 2;      // 2 tokens per second
const TOKEN_BUCKET_SIZE = 10;     // Maximum 10 tokens

interface RetryState {
  tokens: number
  lastRefill: number
  retryCount: number
  lastBackoffDelay: number
}

function App() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [retryQueue, setRetryQueue] = useState<Set<number>>(new Set())
  const [hasNextPage, setHasNextPage] = useState<boolean>(true)
  const [fetchStatus, setFetchStatus] = useState<string[]>([])
  const [attemptedPages, setAttemptedPages] = useState<PageAttempt[]>([])
  const [highestPageAttempted, setHighestPageAttempted] = useState<number>(0)
  const [pageData, setPageData] = useState<Map<number, PageData>>(new Map())
  const [retryMetrics, setRetryMetrics] = useState<RetryMetrics[]>([])
  const [retryState, setRetryState] = useState<RetryState>({
    tokens: TOKEN_BUCKET_SIZE,
    lastRefill: Date.now(),
    retryCount: 0,
    lastBackoffDelay: 0
  });

  const addToRetryQueue = (pageNum: number): void => {
    setRetryQueue(prev => new Set(prev).add(pageNum))
  }

  const removeFromRetryQueue = (pageNum: number): void => {
    setRetryQueue(prev => {
      const newQueue = new Set(prev)
      newQueue.delete(pageNum)
      return newQueue
    })
  }

  const addFetchStatus = (pageNum: number, status: string): void => {
    setFetchStatus(prev => [...prev, `Page ${pageNum}: ${status}`].slice(-5))
  }

  const getStatusIcon = (status: string) => {
    if (status.includes('Success')) return <CheckCircle2 className="h-4 w-4 text-green-500" />
    if (status.includes('Failed')) return <XCircle className="h-4 w-4 text-red-500" />
    if (status.includes('Fetching')) return <RefreshCcw className="h-4 w-4 text-blue-500 animate-spin" />
    return <AlertCircle className="h-4 w-4 text-yellow-500" />
  }

  const formatResponse = (data: ApiResponse | ErrorResponse): string => {
    if ('error' in data) {
      return `Error: ${data.error}`
    }
    return `Success: ${data.data.length} articles [${data.data[0].title} ...]`
  }

  // Token bucket implementation
  const getRetryToken = (): boolean => {
    const now = Date.now();
    const timePassed = now - retryState.lastRefill;
    const newTokens = Math.min(
      TOKEN_BUCKET_SIZE,
      retryState.tokens + (timePassed / 1000) * TOKEN_BUCKET_RATE
    );

    if (newTokens >= 1) {
      setRetryState(prev => ({
        ...prev,
        tokens: newTokens - 1,
        lastRefill: now
      }));
      return true;
    }
    return false;
  };

  // Enhanced backoff calculation with full jitter
  const calculateBackoff = (retryCount: number): number => {
    const exponentialPart = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
    const cappedDelay = Math.min(exponentialPart, MAX_RETRY_DELAY);
    // Full jitter: Generate a random delay between 0 and the calculated delay
    return Math.random() * cappedDelay;
  };

  // Timeout wrapper for fetch
  const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  };

  const fetchArticles = async (pageNum: number, retryCount: number = 0): Promise<void> => {
    setLoading(true)
    setError(null)
    
    // Update highest page attempted
    setHighestPageAttempted(prev => Math.max(prev, pageNum))
    
    try {
      if (retryCount > 0 && !getRetryToken()) {
        throw new Error('Rate limited: Too many retry attempts')
      }

      const retryDelay = calculateBackoff(retryCount)
      addFetchStatus(pageNum, `Attempt ${retryCount + 1} - Fetching page ${pageNum}...`)
      
      const response = await fetchWithTimeout(
        `/articles?page=${pageNum}&per_page=12`,
        {
          headers: { 'Authorization': 'praneeth' }
        },
        REQUEST_TIMEOUT
      )

      const data: ApiResponse | ErrorResponse = await response.json()

      // Update attempted pages
      setAttemptedPages(prev => [...prev, {
        pageNum,
        status: 'error' in data ? 'error' : 'success',
        timestamp: Date.now(),
        statusCode: response.status
      }])

      // Update metrics
      setRetryMetrics(prev => [...prev, {
        timestamp: Date.now(),
        delay: retryDelay,
        pageNum,
        attempt: retryCount + 1,
        statusCode: response.status
      }]);

      // Update page data
      setPageData(prev => {
        const newMap = new Map(prev);
        newMap.set(pageNum, {
          pageNum,
          content: data,
          status: 'error' in data ? 'error' : 'success',
          attempts: (prev.get(pageNum)?.attempts || 0) + 1,
          lastAttemptTime: Date.now()
        });
        return newMap;
      });

      if ('error' in data) {
        throw new Error(data.error);
      }

      // Success case
      setArticles(data.data);
      setHasNextPage(data.is_next);
      removeFromRetryQueue(pageNum);
      addFetchStatus(pageNum, 'Success');

    } catch (err) {
      const error = err as Error
      const isTimeout = error.name === 'AbortError'
      const isRateLimited = error.message.includes('Rate limited')
      
      // Update attempted pages for failures
      setAttemptedPages(prev => [...prev, {
        pageNum,
        status: 'error',
        timestamp: Date.now(),
        statusCode: isTimeout ? 408 : isRateLimited ? 429 : 500
      }])

      if (retryCount < MAX_RETRIES && !isRateLimited) {
        const retryDelay = calculateBackoff(retryCount)
        const delayInSeconds = (retryDelay / 1000).toFixed(1)
        
        addFetchStatus(
          pageNum,
          `Failed (${isTimeout ? 'Timeout' : 'Error'}) - Retry ${retryCount + 1}/${MAX_RETRIES} in ${delayInSeconds}s`
        )
        
        addToRetryQueue(pageNum)
        setTimeout(() => fetchArticles(pageNum, retryCount + 1), retryDelay)
      } else {
        const reason = isRateLimited ? 'Rate limit exceeded' : 'Max retries reached'
        addFetchStatus(pageNum, `Failed - ${reason}`)
        setError(error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchArticles(page)
  }, [page])

  const renderAttemptStats = () => {
    const successfulAttempts = attemptedPages.filter(p => p.status === 'success').length
    const failedAttempts = attemptedPages.filter(p => p.status === 'error').length
    const successRate = (successfulAttempts / (attemptedPages.length || 1) * 100).toFixed(1)

    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Highest Page:</span>
          <Badge variant="outline">{highestPageAttempted}</Badge>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Total Attempts:</span>
          <Badge variant="outline">{attemptedPages.length}</Badge>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Success Rate:</span>
          <Badge variant={successRate === '100.0' ? 'success' : 'secondary'} className={successRate === '100.0' ? 'text-green-600' : 'text-yellow-600'}>
            {successRate}%
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-green-600">Successful:</span>
            <span className="font-medium">{successfulAttempts}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-red-600">Failed:</span>
            <span className="font-medium">{failedAttempts}</span>
          </div>
        </div>
      </div>
    )
  }

  const renderPageData = () => (
    <div className="grid gap-6 mb-8">
      {Array.from(pageData.entries()).map(([pageNum, data]) => (
        <Card key={pageNum}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Page {pageNum}</span>
              <Badge 
                variant={data.status === 'success' ? 'default' : 'destructive'}
              >
                {data.status.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm font-mono bg-muted p-2 rounded">
                {formatResponse(data.content)}
              </p>
              <p className="text-sm text-muted-foreground">
                Attempts: {data.attempts}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )

  const renderRetryInfo = () => {
    const delays = Array.from({length: MAX_RETRIES}, (_, i) => {
      const delay = calculateBackoff(i);
      return `Attempt ${i + 1}: ${(delay/1000).toFixed(1)}s`;
    });

    return (
      <div className="text-sm text-muted-foreground mt-4">
        <p className="font-semibold mb-2">Retry Schedule:</p>
        {delays.map((delay, index) => (
          <p key={index} className="ml-2">{delay}</p>
        ))}
      </div>
    );
  }

  const calculatePerformanceStats = (): PerformanceStats => {
    const stats: PerformanceStats = {
      totalRequests: attemptedPages.length,
      preventedImmediateRetries: retryMetrics.length,
      totalBackoffTime: retryMetrics.reduce((sum, metric) => sum + metric.delay, 0),
      averageBackoffTime: 0,
      maxBackoffTime: Math.max(...retryMetrics.map(m => m.delay), 0),
      retryDistribution: new Map()
    }
    
    // Calculate average backoff time
    stats.averageBackoffTime = stats.totalBackoffTime / (retryMetrics.length || 1)
    
    // Calculate retry distribution
    attemptedPages.forEach(attempt => {
      const current = stats.retryDistribution.get(attempt.pageNum) || 0
      stats.retryDistribution.set(attempt.pageNum, current + 1)
    })
    
    return stats
  }

  const renderPerformanceMetrics = () => {
    const stats = calculatePerformanceStats()
    const preventedLoadPercentage = (stats.preventedImmediateRetries / stats.totalRequests * 100) || 0
    const totalBackoffSeconds = stats.totalBackoffTime / 1000
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance Impact</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Load Reduction</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-green-600">
                    {preventedLoadPercentage.toFixed(1)}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    immediate retries prevented
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-medium">Backoff Impact</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-blue-600">
                    {totalBackoffSeconds.toFixed(1)}s
                  </span>
                  <span className="text-sm text-muted-foreground">
                    total delay added
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Retry Distribution</p>
              <div className="space-y-1">
                {Array.from(stats.retryDistribution.entries()).map(([page, count]) => (
                  <div key={page} className="flex items-center gap-2">
                    <span className="text-sm">Page {page}:</span>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div 
                        className="bg-blue-500 rounded-full h-2" 
                        style={{ 
                          width: `${(count / stats.totalRequests) * 100}%` 
                        }} 
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">{count}x</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Backoff Times</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <p>Average: {(stats.averageBackoffTime / 1000).toFixed(1)}s</p>
                <p>Maximum: {(stats.maxBackoffTime / 1000).toFixed(1)}s</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Articles</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p>Current Page: {page}</p>
              <p>Retry Queue: {Array.from(retryQueue).join(', ') || 'Empty'}</p>
              {loading && <p className="text-blue-500">Loading page {page}...</p>}
            </div>
            {renderAttemptStats()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Fetch History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fetchStatus.map((status, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                {getStatusIcon(status)}
                <span className="text-sm">{status}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        {renderPerformanceMetrics()}
      </div>

      {renderPageData()}

      <div className="flex items-center justify-center space-x-4">
        <Button
          variant="outline"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>
        
        <span className="text-muted-foreground">
          Page {page}
        </span>
        
        <Button
          variant="outline"
          onClick={() => setPage(p => p + 1)}
          disabled={loading || !hasNextPage}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

export default App
