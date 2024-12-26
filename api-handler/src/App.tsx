import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCcw,
  FileX,
  Loader2,
  Database,
  CloudOff,
  CheckCircle,
  NewspaperIcon,
  Coffee,
  Newspaper,
  ScrollText,
  Inbox,
  X,
  XCircle
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

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
  status: 'success' | 'error' | 'loading'
  attempts: number
  lastAttemptTime?: number
}

// Constants for retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second delay between retries

// Add these new components for better visual feedback
const LoadingPulse = () => (
  <div className="flex items-center gap-1">
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
        style={{ animationDelay: `${i * 200}ms` }}
      />
    ))}
  </div>
)

const ArticleCard = ({ article }: { article: Article }) => {
  const { theme } = useTheme()
  const isBreakingNews = article.title.includes('Breaking')
  
  return (
    <div className={`
      group rounded-xl transition-all duration-300 overflow-hidden
      ${theme === 'dark' 
        ? 'bg-gray-800/50 hover:bg-gray-800/80 border-gray-700' 
        : 'bg-white hover:shadow-lg border-gray-100'}
      border backdrop-blur-sm
    `}>
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className={`
            text-lg font-semibold mb-1 group-hover:text-blue-500 transition-colors
            ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}
          `}>
            {article.title}
          </h2>
          <Badge 
            variant={isBreakingNews ? 'destructive' : 'secondary'}
            className="animate-in fade-in duration-300 shrink-0"
          >
            {isBreakingNews ? 'Breaking News' : 'Opinion'}
          </Badge>
        </div>
        <p className={`
          line-clamp-3 text-sm leading-relaxed
          ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}
        `}>
          {article.content}
        </p>
        <div className={`
          pt-4 border-t
          ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}
        `}>
          <Button 
            variant="outline" 
            className="text-sm hover:text-blue-500"
          >
            Read more →
          </Button>
        </div>
      </div>
    </div>
  )
}

const ArticleSkeleton = () => {
  const { theme } = useTheme()
  
  return (
    <div className={`
      rounded-xl p-6
      ${theme === 'dark' ? 'bg-gray-800/50' : 'bg-white'}
    `}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className={`
            h-7 rounded-md w-3/4 animate-pulse
            ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}
          `}/>
          <div className={`
            h-6 rounded-full w-20 animate-pulse
            ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}
          `}/>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div 
              key={i}
              className={`
                h-4 rounded-md animate-pulse
                ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}
              `}
              style={{ width: `${100 - (i * 10)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const PageIndicator = ({ pageNum, currentPage, status, attempts }: { 
  pageNum: number
  currentPage: number
  status: 'success' | 'error' | 'loading' | 'default'
  attempts?: number
}) => (
  <div className={`
    relative rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200
    ${pageNum === currentPage ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
    ${status === 'success' ? 'bg-green-50 text-green-700' : 
      status === 'error' ? 'bg-red-50 text-red-700' : 
      'bg-gray-50 text-gray-700'}
  `}>
    {pageNum}
    {status === 'loading' && (
      <div className="absolute -top-1 -right-1">
        <LoadingPulse />
      </div>
    )}
  </div>
)

const LoadingGrid = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
    {Array.from({ length: 12 }).map((_, i) => (
      <div
        key={i}
        className="animate-in fade-in slide-in-from-bottom-4 duration-300"
        style={{ animationDelay: `${i * 100}ms` }}
      >
        <ArticleSkeleton />
      </div>
    ))}
  </div>
)

// Add this new component for empty/error states
const StateIllustration = ({ 
  type, 
  message 
}: { 
  type: 'empty' | 'error' | 'loading'
  message: string 
}) => {
  const { theme } = useTheme()
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className={`
        p-8 rounded-full mb-6
        ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}
      `}>
        {type === 'empty' && (
          <Database className="w-12 h-12 text-gray-400 animate-in spin-in-180 duration-500" />
        )}
        {type === 'error' && (
          <CloudOff className="w-12 h-12 text-orange-400 animate-bounce" />
        )}
        {type === 'loading' && (
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        )}
      </div>
      <h3 className={`
        text-xl font-semibold mb-2
        ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}
      `}>
        {type === 'empty' && 'No Articles Found'}
        {type === 'error' && 'Failed to Load'}
        {type === 'loading' && 'Loading Articles'}
      </h3>
      <p className={`
        text-center max-w-md
        ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}
      `}>
        {message}
      </p>
    </div>
  )
}

// Add this component for the end of feed modal
const EndOfFeedModal = ({ show, onClose }: { 
  show: boolean
  onClose: () => void 
}) => {
  const { theme } = useTheme()
  
  const messages = [
    {
      text: "That's all the news for now! Time for a coffee break ☕",
      subtext: "Our journalists run on caffeine too!",
      icon: <Coffee className="w-12 h-12 animate-bounce" />
    },
    {
      text: "You've reached the end of the feed!",
      subtext: "Our journalists are busy writing more stories with their mechanical keyboards...",
      icon: <Newspaper className="w-12 h-12 animate-pulse" />
    },
    {
      text: "No more articles to scroll through!",
      subtext: "Maybe it's time to write your own viral tech blog? 💻",
      icon: <ScrollText className="w-12 h-12 animate-in spin-in-180" />
    },
    {
      text: "Breaking News: You've finished all articles!",
      subtext: "404: More content not found (yet)",
      icon: <FileX className="w-12 h-12 animate-bounce" />
    },
    {
      text: "Inbox Zero Achieved!",
      subtext: "If only email inboxes were this manageable...",
      icon: <Inbox className="w-12 h-12 animate-bounce" />
    }
  ]

  const message = messages[Math.floor(Math.random() * messages.length)]

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!show) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div 
        className={`
          relative w-full max-w-sm rounded-xl p-6 shadow-lg
          animate-in slide-in-from-bottom-4 duration-300
          ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}
        `}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className={`
            absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100
            ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}
          `}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4 text-center">
          <div className={`
            inline-flex p-4 rounded-full mx-auto
            ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}
          `}>
            <div className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>
              {message.icon}
            </div>
          </div>
          
          <h3 className={`
            text-xl font-semibold
            ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}
          `}>
            {message.text}
          </h3>
          
          <p className={`
            text-sm
            ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}
          `}>
            {message.subtext}
          </p>

          <p className={`
            mt-4 text-xs
            ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}
          `}>
            Click anywhere to dismiss
          </p>
        </div>
      </div>
    </div>
  )
}

// Update the status components to be more prominent
const BottomStatusBar = ({ 
  visitedPages, 
  currentPage, 
  hasNextPage,
  loading,
  error 
}: { 
  visitedPages: Set<number>
  currentPage: number
  hasNextPage: boolean
  loading: boolean
  error: string | null
}) => {
  const { theme } = useTheme()
  
  return (
    <div className={`
      fixed bottom-0 left-0 right-0 z-50
      ${theme === 'dark' ? 'bg-gray-900/90' : 'bg-white/90'}
      backdrop-blur-sm border-t
      ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}
    `}>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Sync Status */}
          <div className="flex items-center gap-4">
            <span className={`
              font-medium text-sm
              ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}
            `}>
              Navigation History:
            </span>
            <div className="flex flex-wrap gap-1 max-w-[300px]">
              {Array.from(visitedPages).sort((a, b) => a - b).map(page => (
                <span
                  key={page}
                  className={`
                    px-2 py-0.5 rounded-md text-xs font-medium
                    ${page === currentPage 
                      ? 'bg-blue-500 text-white' 
                      : theme === 'dark'
                        ? 'bg-gray-800 text-gray-400'
                        : 'bg-gray-100 text-gray-600'
                    }
                  `}
                >
                  {page}
                </span>
              ))}
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-4">
            {loading && (
              <div className="flex items-center gap-2">
                <LoadingPulse />
                <span className="text-sm text-blue-500">Loading page {currentPage}</span>
              </div>
            )}
            {!hasNextPage && (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500">End of content</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const PageStatusCard = ({ pageData }: { 
  pageData: Map<number, PageData> 
}) => {
  const { theme } = useTheme()
  
  const sortedPages = Array.from(pageData.entries())
    .sort(([a], [b]) => a - b)

  return (
    <div className={`
      fixed top-24 right-4 z-40 w-64 rounded-lg shadow-lg border mt-14
      ${theme === 'dark' 
        ? 'bg-gray-800/90 border-gray-700' 
        : 'bg-white/90 border-gray-200'}
      backdrop-blur-sm
    `}>
      <div className="p-4">
        <h3 className={`
          text-sm font-medium mb-3
          ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}
        `}>
          Page Status History
        </h3>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {sortedPages.map(([pageNum, data]) => (
            <div 
              key={pageNum}
              className={`
                flex items-center justify-between p-2 rounded-md text-sm
                ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gray-50'}
              `}
            >
              <span className={`
                ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}
              `}>
                Page {pageNum}
              </span>
              <div className="flex items-center gap-2">
                {data.status === 'success' && (
                  <span className="text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Success
                  </span>
                )}
                {data.status === 'error' && (
                  <span className="text-red-500 flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    Failed ({data.attempts})
                  </span>
                )}
                {data.status === 'loading' && (
                  <span className="text-blue-500 flex items-center gap-1">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  const { theme, setTheme } = useTheme()
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [hasNextPage, setHasNextPage] = useState<boolean>(true)
  const [pageData, setPageData] = useState<Map<number, PageData>>(new Map())
  const [visitedPages, setVisitedPages] = useState<Set<number>>(new Set())
  const [showEndModal, setShowEndModal] = useState(false)

  // Simplified fetch function without retry logic
  const fetchArticles = async (pageNum: number, retryCount = 0): Promise<void> => {
    if (retryCount >= MAX_RETRIES) {
      setArticles([]) // Clear articles on max retries
      return;
    }

    if (retryCount === 0) {
      setLoading(true)
      setError(null)
    }

    try {
      const response = await fetch(
        `/articles?page=${pageNum}&per_page=10`,
        {
          headers: { 'Authorization': 'praneeth' }
        }
      )

      const data: ApiResponse | ErrorResponse = await response.json()

      // Update page data with correct attempt count
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
      setVisitedPages(prev => new Set(prev).add(pageNum))
      setError(null)

    } catch (err) {
      const error = err as Error
      
      if (retryCount < MAX_RETRIES - 1) {
        setError(`Retrying page ${pageNum}... (Attempt ${retryCount + 1}/${MAX_RETRIES})`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        return fetchArticles(pageNum, retryCount + 1)
      }

      setArticles([]) // Clear articles on error
      setError(`Failed to load page ${pageNum} after ${MAX_RETRIES} attempts. Try another page or come back later.`)
    } finally {
      if (retryCount === 0 || retryCount === MAX_RETRIES - 1) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchArticles(page)
  }, [page])

  // Show modal when reaching the end with delay
  useEffect(() => {
    if (!loading && !error && articles.length > 0 && !hasNextPage) {
      const timer = setTimeout(() => {
        setShowEndModal(true)
      }, 1000) // 1 second delay
      
      return () => clearTimeout(timer) // Cleanup
    }
  }, [loading, error, articles.length, hasNextPage])

  return (
    <div className={`
      min-h-screen pb-16 transition-colors duration-300
      ${theme === 'dark' 
        ? 'bg-gradient-to-b from-gray-900 to-gray-800' 
        : 'bg-gradient-to-b from-gray-50 to-white'}
    `}>
      {/* Fixed Header */}
      <header className={`
        sticky top-0 z-50 backdrop-blur-sm border-b w-full
        ${theme === 'dark' 
          ? 'bg-gray-900/80 border-gray-700' 
          : 'bg-white/80 border-gray-200'}
      `}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className={`
              text-2xl font-bold flex items-center gap-3 min-w-[200px]
              ${theme === 'dark' ? 'text-white' : 'text-gray-900'}
            `}>
              News Feed
              {loading && <LoadingPulse />}
            </h1>
            
            <div className="flex items-center gap-6">
              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className={theme === 'dark' ? 'text-gray-100' : 'text-gray-700'}
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>

              {/* Navigation Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant={theme === 'dark' ? 'outline' : 'default'}
                  onClick={() => setPage(p => p - 1)}
                  disabled={loading || page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                <Button
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  onClick={() => setPage(p => p + 1)}
                  disabled={loading || !hasNextPage}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>

          {/* Page Indicators */}
          <div className="py-2 flex justify-center">
            <div className="flex items-center gap-2">
              {Array.from({ length: 5 }, (_, i) => page - 2 + i).map(pageNum => (
                pageNum > 0 && (
                  <PageIndicator
                    key={pageNum}
                    pageNum={pageNum}
                    currentPage={page}
                    status={
                      pageData.get(pageNum)?.status === 'success' ? 'success' :
                      pageData.get(pageNum)?.status === 'error' ? 'error' :
                      loading && pageNum === page ? 'loading' : 'default'
                    }
                    attempts={pageData.get(pageNum)?.attempts}
                  />
                )
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[800px]">
        {/* Status Messages */}
        {(loading || error) && (
          <div className={`
            mb-8 rounded-lg p-4 animate-in fade-in slide-in-from-top-4 duration-300
            ${loading 
              ? theme === 'dark' ? 'bg-blue-900/50' : 'bg-blue-50' 
              : theme === 'dark' ? 'bg-orange-900/50' : 'bg-orange-50'} 
          `}>
            <div className="flex items-center gap-3">
              {loading ? (
                <>
                  <RefreshCcw className="h-5 w-5 text-blue-500 animate-spin" />
                  <div className="text-blue-700">
                    <p className="font-medium">Loading page {page}</p>
                    <p className="text-sm opacity-75">
                      Attempt {pageData.get(page)?.attempts || 1} of {MAX_RETRIES}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                  <div className="text-orange-700">
                    <p className="font-medium">{error}</p>
                    <p className="text-sm opacity-75">
                      You can continue browsing other pages
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Articles Grid with State Illustrations */}
        {loading ? (
          <LoadingGrid />
        ) : error ? (
          <StateIllustration 
            type="error"
            message={error}
          />
        ) : articles.length === 0 ? (
          <StateIllustration 
            type="empty"
            message="No articles available for this page. Try navigating to a different page."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {articles.map((article, i) => (
                <div
                  key={article.id}
                  className="animate-in fade-in slide-in-from-bottom-4 duration-300"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <ArticleCard article={article} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Enhanced Status Indicator */}
        <div className="mt-8 flex justify-center">
          <div className="flex items-center gap-6 px-6 py-3 bg-gray-50 rounded-full text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              <span className="text-gray-600">Successfully loaded</span>
            </div>
            <div className="flex items-center gap-2">
              <LoadingPulse />
              <span className="text-gray-600">Loading in progress</span>
            </div>
            {error && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                <span className="text-gray-600">Failed to load</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Fixed Bottom Status Bar */}
      <BottomStatusBar 
        visitedPages={visitedPages}
        currentPage={page}
        hasNextPage={hasNextPage}
        loading={loading}
        error={error}
      />

      {/* End of Feed Modal */}
      <EndOfFeedModal 
        show={showEndModal} 
        onClose={() => setShowEndModal(false)} 
      />

      {/* Add PageStatusCard */}
      <PageStatusCard pageData={pageData} />
    </div>
  )
}

export default App
