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
  XCircle, 
  ChevronDown, 
  ChevronUp 
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

// Add new state for queued retries
interface QueuedRetry {
  pageNum: number;
  retryCount: number;
  queuedAt: number;
}

function App() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [retryQueue, setRetryQueue] = useState<QueuedRetry[]>([])
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
  const [isPageDataExpanded, setIsPageDataExpanded] = useState(false);
  const [actualRetryRate, setActualRetryRate] = useState<number>(0);

  const addToRetryQueue = (retry: QueuedRetry): void => {
    setRetryQueue(prev => [...prev, retry]);
  }

  const removeFromRetryQueue = (pageNum: number): void => {
    setRetryQueue(prev => prev.filter(retry => retry.pageNum !== pageNum));
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

  // Add useEffect to handle token refills
  useEffect(() => {
    const refillInterval = setInterval(() => {
      const now = Date.now();
      setRetryState(prev => {
        const timePassed = (now - prev.lastRefill) / 1000; // Convert to seconds
        const tokensToAdd = timePassed * TOKEN_BUCKET_RATE;
        const newTokens = Math.min(
          TOKEN_BUCKET_SIZE,
          prev.tokens + tokensToAdd
        );
        
        return {
          ...prev,
          tokens: newTokens,
          lastRefill: now
        };
      });
    }, 1000); // Update every second

    return () => clearInterval(refillInterval);
  }, []);

  // Update getRetryToken to be more precise
  const getRetryToken = (): boolean => {
    const now = Date.now();
    setRetryState(prev => {
      const timePassed = (now - prev.lastRefill) / 1000;
      const newTokens = Math.min(
        TOKEN_BUCKET_SIZE,
        prev.tokens + (timePassed * TOKEN_BUCKET_RATE)
      );

      if (newTokens >= 1) {
        return {
          ...prev,
          tokens: newTokens - 1,
          lastRefill: now,
          retryCount: prev.retryCount + 1
        };
      }
      return prev;
    });

    return retryState.tokens >= 1;
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

  // Add useEffect to process the retry queue
  useEffect(() => {
    const processQueue = async () => {
      if (retryQueue.length > 0 && retryState.tokens >= 1) {
        const nextRetry = retryQueue[0];
        removeFromRetryQueue(nextRetry.pageNum);
        
        // Calculate queue time
        const queueTime = Date.now() - nextRetry.queuedAt;
        
        // Add to metrics
        setRetryMetrics(prev => [...prev, {
          timestamp: Date.now(),
          delay: queueTime,
          pageNum: nextRetry.pageNum,
          attempt: nextRetry.retryCount + 1,
          statusCode: 429
        }]);

        // Attempt the retry
        await fetchArticles(nextRetry.pageNum, nextRetry.retryCount);
      }
    };

    const interval = setInterval(processQueue, 1000);
    return () => clearInterval(interval);
  }, [retryQueue, retryState.tokens]);

  // Update fetchArticles to use queue
  const fetchArticles = async (pageNum: number, retryCount: number = 0): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      if (retryCount > 0) {
        if (!getRetryToken()) {
          // Add to queue
          addToRetryQueue({
            pageNum,
            retryCount,
            queuedAt: Date.now()
          });
          
          addFetchStatus(
            pageNum,
            `Rate limited - Added to queue (Position: ${retryQueue.length + 1})`
          );
          
          return;
        }
      }

      // Update highest page attempted
      setHighestPageAttempted(prev => Math.max(prev, pageNum))
      
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

      if (retryCount < MAX_RETRIES) {
        const retryDelay = calculateBackoff(retryCount)
        
        if (isRateLimited || !getRetryToken()) {
          // Add to queue
          addToRetryQueue({
            pageNum,
            retryCount,
            queuedAt: Date.now()
          });
          
          addFetchStatus(
            pageNum,
            `Rate limited - Added to queue (Position: ${retryQueue.length + 1})`
          );
        } else {
          // Normal retry with backoff
          setTimeout(() => fetchArticles(pageNum, retryCount + 1), retryDelay);
        }
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="text-green-800 text-sm font-medium">Successful</div>
            <div className="mt-2 flex justify-between items-baseline">
              <div className="text-2xl font-bold text-green-600">{successfulAttempts}</div>
              <div className="text-sm text-green-600">attempts</div>
            </div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="text-red-800 text-sm font-medium">Failed</div>
            <div className="mt-2 flex justify-between items-baseline">
              <div className="text-2xl font-bold text-red-600">{failedAttempts}</div>
              <div className="text-sm text-red-600">attempts</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-600">Success Rate</span>
            <Badge variant={successRate === '100.0' ? 'default' : 'secondary'} 
                  className={`px-3 py-1 ${successRate === '100.0' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {successRate}%
            </Badge>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${successRate}%` }}></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm font-medium text-gray-600">Highest Page</div>
            <div className="mt-2 text-2xl font-bold">{highestPageAttempted}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm font-medium text-gray-600">Total Attempts</div>
            <div className="mt-2 text-2xl font-bold">{attemptedPages.length}</div>
          </div>
        </div>
      </div>
    )
  }

  const renderPageData = () => (
    <div className="grid gap-6 mb-8">
      {Array.from(pageData.entries()).map(([pageNum, data]) => (
        <Card key={pageNum} className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="bg-gray-50 border-b">
            <CardTitle className="flex items-center justify-between">
              <span className="text-lg font-semibold">Page {pageNum}</span>
              <Badge 
                variant={data.status === 'success' ? 'default' : 'destructive'}
                className={`px-3 py-1 ${
                  data.status === 'success' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {data.status.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <p className="text-sm font-mono bg-gray-50 p-3 rounded-md border">
                {formatResponse(data.content)}
              </p>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Attempts: {data.attempts}</span>
                {data.lastAttemptTime && (
                  <span>Last attempt: {new Date(data.lastAttemptTime).toLocaleTimeString()}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )

  const calculatePerformanceStats = (): PerformanceStats => {
    const stats: PerformanceStats = {
      totalRequests: attemptedPages.length,
      preventedImmediateRetries: retryMetrics.length,
      totalBackoffTime: retryMetrics
        .filter(metric => metric.delay > 0 && metric.statusCode !== 200) // Only count real retries
        .reduce((sum, metric) => sum + metric.delay, 0),
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
                <div className="flex flex-col">
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
                <div className="flex flex-col">
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

  const renderRetryQueueCard = () => {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Retry Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {retryQueue.length > 0 ? (
              retryQueue.map(retry => {
                const pageInfo = pageData.get(retry.pageNum);
                return (
                  <div key={retry.pageNum} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="space-y-1">
                      <div className="font-medium">Page {retry.pageNum}</div>
                      <div className="text-sm text-muted-foreground">
                        Attempts: {pageInfo?.attempts || 0}
                      </div>
                    </div>
                    <Badge 
                      variant="secondary"
                      className="bg-yellow-100 text-yellow-800"
                    >
                      Pending Retry
                    </Badge>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <RefreshCcw className="h-5 w-5 mx-auto mb-2 opacity-50" />
                <p>No pages in retry queue</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderBackoffVisualization = () => {
    const retryAttempts = retryMetrics.filter(m => m.pageNum === page);
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request Optimization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Token Bucket Status */}
            <div>
              <h3 className="text-sm font-medium mb-2">Rate Limiting</h3>
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm">Available Tokens</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{retryState.tokens.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">
                      ({TOKEN_BUCKET_RATE}/sec refill rate)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 rounded-full h-2 transition-all duration-300"
                    style={{ width: `${(retryState.tokens / TOKEN_BUCKET_SIZE) * 100}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Retries attempted: {retryState.retryCount}
                </div>
              </div>
            </div>

            {/* Backoff Strategy */}
            <div>
              <h3 className="text-sm font-medium mb-2">Recent Retry Attempts</h3>
              <div className="space-y-2">
                {retryAttempts.length > 0 ? (
                  retryAttempts.map((metric, index) => (
                    <div key={index} className="relative">
                      <div className="flex items-center gap-2">
                        <div className="w-24">
                          <span className="text-sm">Attempt {metric.attempt}</span>
                        </div>
                        <div className="flex-1 h-8 relative">
                          <div 
                            className="absolute h-2 bg-blue-500 rounded-full top-3"
                            style={{ 
                              width: `${(metric.delay / MAX_RETRY_DELAY) * 100}%`,
                              opacity: 0.7
                            }}
                          />
                          <span className="absolute right-0 text-xs text-gray-500">
                            {(metric.delay / 1000).toFixed(1)}s delay
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-2">
                    No retries for current page
                  </div>
                )}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-sm text-blue-800">Token Usage</div>
                <div className="text-xl font-semibold text-blue-900">
                  {TOKEN_BUCKET_SIZE - retryState.tokens}/{TOKEN_BUCKET_SIZE}
                </div>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <div className="text-sm text-purple-800">Current Rate</div>
                <div className="text-xl font-semibold text-purple-900">
                  {actualRetryRate}/sec
                </div>
                <div className="text-xs text-purple-600">
                  Max: {TOKEN_BUCKET_RATE}/sec
                </div>
              </div>
            </div>

            {/* Queue Status */}
            <div>
              <h3 className="text-sm font-medium mb-2">Queue Status</h3>
              {retryQueue.length > 0 ? (
                <div className="space-y-2">
                  {retryQueue.map((queued, index) => (
                    <div key={index} className="flex items-center justify-between bg-yellow-50 p-2 rounded">
                      <span className="text-sm">
                        Page {queued.pageNum} (Attempt {queued.retryCount + 1})
                      </span>
                      <span className="text-xs text-gray-500">
                        Queued: {((Date.now() - queued.queuedAt) / 1000).toFixed(1)}s ago
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-2">
                  No requests in queue
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Add this useEffect to calculate actual rate
  useEffect(() => {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    // Count retries in the last second
    const recentRetries = retryMetrics
      .filter(metric => metric.timestamp > oneSecondAgo)
      .length;

    setActualRetryRate(recentRetries);

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const recentRetries = retryMetrics
        .filter(metric => metric.timestamp > (currentTime - 1000))
        .length;
      setActualRetryRate(recentRetries);
    }, 200); // Update 5 times per second

    return () => clearInterval(interval);
  }, [retryMetrics]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container max-w-full mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">API Request Monitor</h1>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">Page {page}</span>
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
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
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

          {renderBackoffVisualization()}
          {renderRetryQueueCard()}
          {renderPerformanceMetrics()}

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
          <Button
            variant="outline"
            onClick={() => setIsPageDataExpanded(!isPageDataExpanded)}
            className="w-full flex items-center justify-between p-4"
          >
            <span>Page Data History</span>
            {isPageDataExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          {isPageDataExpanded && renderPageData()}
        </div>
      </div>
    </div>
  )
}

export default App
