import { useEffect, useState } from 'react'
import axios from 'axios'
import './App.css'
import ProductCard from './components/ProductCard'

const DEFAULT_PRODUCT = {
  price: {
    amount: 100000,
    currency: 'INR'
  },
  _id: '6adc355c31c345e9767facbe',
  image: 'https://plus.unsplash.com/premium_photo-1683121716061-3faddf4dc504?q=80&w=1332&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D',
  title: 'test_title',
  description: 'test_description',
  __v: 0
}

function App() {
  const [product, setProduct] = useState(DEFAULT_PRODUCT)
  const [notification, setNotification] = useState('')

  useEffect(() => {
    let isMounted = true

    axios
      .get('http://localhost:3000/api/products/get-item')
      .then((response) => {
        if (isMounted && response?.data?.product) {
          setProduct(response.data.product)
        }
      })
      .catch((error) => {
        // Fallback to sample data if backend server is not running
        console.warn('Backend item fetch not available, using default product data:', error.message)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const showNotification = (message) => {
    setNotification(message)
    setTimeout(() => {
      setNotification('')
    }, 3500)
  }

  const handleBuyNow = (selectedProduct) => {
    showNotification(`Proceeding to checkout for "${selectedProduct.title}"...`)
  }

  return (
    <main className="app-container">
      <header className="app-header">
        <p className="app-header__subtitle">Store Checkout</p>
        <h1 className="app-header__title">Featured Product</h1>
      </header>

      <ProductCard
        product={product}
        onBuyNow={handleBuyNow}
      />

      {notification && (
        <aside className="toast-notice" role="status" aria-live="polite">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>{notification}</span>
        </aside>
      )}
    </main>
  )
}

export default App
