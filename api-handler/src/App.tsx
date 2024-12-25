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

  const fetchArticles = async (pageNum: number, retryCount: number = 0): Promise<void> => {
    setLoading(true)
    setError(null)
    
    setHighestPageAttempted(prev => Math.max(prev, pageNum))
    
    try {
      addFetchStatus(pageNum, `Attempt ${retryCount + 1} - Fetching...`)
      
      const response = await fetch(
        `/articles?page=${pageNum}&per_page=12`,
        {
          headers: {
            'Authorization': 'praneeth'
          }
        }
      )

      const data: ApiResponse | ErrorResponse = await response.json()

      if ('error' in data) {
        setAttemptedPages(prev => [...prev, {
          pageNum,
          status: 'error',
          timestamp: Date.now()
        }])
        throw new Error(data.error)
      }

      setAttemptedPages(prev => [...prev, {
        pageNum,
        status: 'success',
        timestamp: Date.now()
      }])

      setArticles(prev => {
        const articleMap = new Map(prev.map(article => [article.id, article]))
        data.data.forEach(article => {
          articleMap.set(article.id, article)
        })
        return Array.from(articleMap.values()).sort((a, b) => a.id - b.id)
      })

      setHasNextPage(data.is_next)
      removeFromRetryQueue(pageNum)
      addFetchStatus(pageNum, 'Success')

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Articles</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Fetch Status</CardTitle>
          </CardHeader>
          <CardContent>
            {renderAttemptStats()}
            <div className="space-y-2 mt-4">
              {fetchStatus.map((status, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  {getStatusIcon(status)}
                  <span className="text-sm">{status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Retry Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from(retryQueue).map(pageNum => (
              <div key={pageNum} className="flex items-center gap-2 p-2 bg-yellow-50 rounded-md">
                <RefreshCcw className="h-4 w-4 animate-spin text-yellow-600" />
                <span className="text-sm text-yellow-700">Page {pageNum} pending...</span>
              </div>
            ))}
            {retryQueue.size === 0 && (
              <p className="text-sm text-muted-foreground">No pending retries</p>
            )}
          </CardContent>
        </Card>
      </div>

      {loading && (
        <div className="grid gap-4 mb-6">
          {[1, 2, 3].map((n) => (
            <Card key={n}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-[250px] mb-2" />
                <Skeleton className="h-4 w-[400px]" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="grid gap-6 mb-8">
        {articles.map(article => (
          <Card key={article.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{article.title}</span>
                <Badge variant="outline">#{article.id}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{article.content}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
