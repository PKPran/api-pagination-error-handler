import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
}

interface PageData {
  pageNum: number
  content: ApiResponse | ErrorResponse
  status: 'success' | 'error'
  attempts: number
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

  const fetchArticles = async (pageNum: number, retryCount: number = 0): Promise<void> => {
    setLoading(true)
    setError(null)
    
    // Update highest page attempted
    setHighestPageAttempted(prev => Math.max(prev, pageNum))
    
    try {
      addFetchStatus(pageNum, `Attempt ${retryCount + 1} - Fetching page ${pageNum}...`)
      
      const response = await fetch(
        `/articles?page=${pageNum}&per_page=12`,
        {
          headers: {
            'Authorization': 'praneeth'
          }
        }
      )

      const data: ApiResponse | ErrorResponse = await response.json()

      // Update page data regardless of success/error
      setPageData(prev => {
        const newMap = new Map(prev)
        newMap.set(pageNum, {
          pageNum,
          content: data,
          status: 'error' in data ? 'error' : 'success',
          attempts: (prev.get(pageNum)?.attempts || 0) + 1
        })
        return newMap
      })

      // Update attempted pages
      setAttemptedPages(prev => [...prev, {
        pageNum,
        status: 'error' in data ? 'error' : 'success',
        timestamp: Date.now()
      }])

      if ('error' in data) {
        throw new Error(data.error)
      }

      // On success, update articles state
      if ('data' in data) {
        setArticles(data.data)
        setHasNextPage(data.is_next)
        removeFromRetryQueue(pageNum)
        addFetchStatus(pageNum, 'Success')
      }

    } catch (err) {
      if (retryCount < 5) {
        addFetchStatus(pageNum, `Failed - Retry ${retryCount + 1}/5 in 2s`)
        addToRetryQueue(pageNum)
        setTimeout(() => fetchArticles(pageNum, retryCount + 1), 2000)
      } else {
        addFetchStatus(pageNum, 'Failed - Max retries reached')
        setError(err instanceof Error ? err.message : 'An unknown error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchArticles(page)
  }, [page])

  const renderAttemptStats = () => (
    <div className="text-sm text-muted-foreground">
      <p>Highest page attempted: {highestPageAttempted}</p>
      <p>Total attempts: {attemptedPages.length}</p>
      <p>Successful: {attemptedPages.filter(p => p.status === 'success').length}</p>
      <p>Failed: {attemptedPages.filter(p => p.status === 'error').length}</p>
    </div>
  )

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Articles</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>Current Page: {page}</p>
            <p>Retry Queue: {Array.from(retryQueue).join(', ') || 'Empty'}</p>
            {loading && <p className="text-blue-500">Loading page {page}...</p>}
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
