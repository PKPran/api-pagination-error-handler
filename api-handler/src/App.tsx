import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCcw,
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
interface PageData {
  pageNum: number
  content: ApiResponse | ErrorResponse
  status: 'success' | 'error'
  attempts: number
  lastAttemptTime?: number
}

// Constants for retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second delay between retries

// Add new loading skeleton component
const ArticleSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
    <div className="h-3 bg-gray-100 rounded w-1/2"></div>
  </div>
)

function App() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [hasNextPage, setHasNextPage] = useState<boolean>(true)
  const [pageData, setPageData] = useState<Map<number, PageData>>(new Map())

  // Simplified fetch function without retry logic
  const fetchArticles = async (pageNum: number, retryCount = 0): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/articles?page=${pageNum}&per_page=12`,
        {
          headers: { 'Authorization': 'praneeth' }
        }
      )

      const data: ApiResponse | ErrorResponse = await response.json()

      // Update page data with retry count
      setPageData(prev => {
        const newMap = new Map(prev)
        newMap.set(pageNum, {
          pageNum,
          content: data,
          status: 'error' in data ? 'error' : 'success',
          attempts: retryCount + 1,
          lastAttemptTime: Date.now()
        })
        return newMap
      })

      if ('error' in data) {
        throw new Error(data.error)
      }

      setArticles(data.data)
      setHasNextPage(data.is_next)

    } catch (err) {
      const error = err as Error

      // Implement retry logic
      if (retryCount < MAX_RETRIES) {
        setError(`Attempt ${retryCount + 1}/${MAX_RETRIES}: ${error.message}. Retrying...`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        return fetchArticles(pageNum, retryCount + 1)
      }

      setError(`Failed after ${MAX_RETRIES} attempts: ${error.message}`)
      // Don't disable next page navigation after max retries
      // This allows users to skip problematic pages
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchArticles(page)
  }, [page])

  // Enhanced page data display with better layout and loading states
  const renderPageData = () => (
    <div className="max-w-full mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {Array.from(pageData.entries()).map(([pageNum, data]) => (
          <Card key={pageNum} className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="bg-gray-50">
              <CardTitle className="flex items-center justify-between">
                <span className="text-lg font-semibold">Page {pageNum}</span>
                <Badge 
                  variant={data.status === 'success' ? 'default' : 'destructive'}
                  className="animate-in fade-in"
                >
                  {data.status === 'success' ? 'LOADED' : `ATTEMPT ${data.attempts}/${MAX_RETRIES}`}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {data.status === 'success' ? (
                <div className="space-y-3">
                  {(data.content as ApiResponse).data.map(article => (
                    <div 
                      key={article.id} 
                      className="p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-all"
                    >
                      <h3 className="font-medium text-gray-800">{article.title}</h3>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {article.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {[1, 2, 3].map(n => (
                    <ArticleSkeleton key={n} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Header Section - Now full width */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-800">Articles</h1>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => setPage(p => p - 1)}
                disabled={loading || page <= 1}
                className="transition-all"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <span className="px-4 py-2 bg-gray-100 rounded-md font-medium">
                Page {page}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(p => p + 1)}
                disabled={loading || !hasNextPage}
                className="transition-all"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="text-center py-6 bg-white rounded-lg mt-4 shadow-sm">
              <div className="flex items-center justify-center gap-3">
                <RefreshCcw className="h-5 w-5 animate-spin text-blue-500" />
                <p className="text-gray-600">
                  Loading page {page}... Attempt {pageData.get(page)?.attempts || 1}/{MAX_RETRIES}
                </p>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-4 bg-white border-l-4 border-red-500 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <p className="text-gray-700">{error}</p>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Don't worry! You can continue browsing other pages while we keep trying.
              </p>
            </div>
          )}
        </div>

        {/* Content Section */}
        {renderPageData()}
      </div>
    </div>
  )
}

export default App
