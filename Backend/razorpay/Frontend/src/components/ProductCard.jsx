import { useState } from 'react'
import PaymentButton from '../PaymentButton'

function ProductCard({ product, onBuyNow }) {
  const [isHovered, setIsHovered] = useState(false)

  if (!product) {
    return null
  }

  const { title, description, price, image } = product

  const formatPrice = (priceObj) => {
    if (!priceObj || typeof priceObj.amount !== 'number') return '₹0'
    // Convert from paise to INR (1 INR = 100 paise)
    const inRupees = priceObj.amount / 100
    const symbol = priceObj.currency === 'INR' ? '₹' : (priceObj.currency === 'USD' ? '$' : `${priceObj.currency} `)
    return `${symbol}${inRupees.toLocaleString('en-IN')}`
  }

  return (
    <article
      className={`product-card ${isHovered ? 'product-card--hover' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="product-card__image-wrapper">
        <img
          src={image}
          alt={title || 'Product Image'}
          className="product-card__image"
          loading="lazy"
        />
        <span className="product-card__badge">In Stock</span>
      </div>

      <div className="product-card__content">
        <header className="product-card__header">
          <h2 className="product-card__title">{title}</h2>
          <p className="product-card__description">{description}</p>
        </header>

        <div className="product-card__pricing-row">
          <div className="product-card__price-box">
            <span className="product-card__price-label">Price</span>
            <span className="product-card__price-value">{formatPrice(price)}</span>
          </div>
        </div>

        <div className="product-card__actions">
          <PaymentButton />
        </div>

        <footer className="product-card__footer">
          <div className="product-card__feature">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span>Secure Checkout</span>
          </div>
          <span className="dot-separator">•</span>
          <div className="product-card__feature">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
            <span>Instant Dispatch</span>
          </div>
        </footer>
      </div>
    </article>
  )
}

export default ProductCard
