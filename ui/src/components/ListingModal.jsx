import { useEffect, useMemo, useState } from 'react';
import { CometChat } from '@cometchat/chat-sdk-javascript';
import { CometChatAIAssistantChat, CometChatUIKit } from '@cometchat/chat-uikit-react';
import { buildListingDetailSnapshot, buildListingMetadataPayload } from '../utils/listingMetadata.js';

const heroFallback = new URL('../assets/images/listing-placeholder.svg', import.meta.url).href;

const defaultHighlights = [
  'Sparkling pool and spa',
  'Inviting cabana',
  'Backyard paradise',
  'Private backyard views',
  'Expansive custom closet',
  'Formal dining room',
  'Soaking tub',
];

const climateFactors = [
  { label: 'Flood Factor', value: '1/10', description: 'FEMA Zone X (unshaded), a minimal-risk flood area' },
  { label: 'Fire Factor', value: '4/10', description: 'Moderate wildfire risk based on regional data' },
  { label: 'Wind Factor', value: '4/10', description: 'Typical seasonal wind exposure' },
  { label: 'Air Factor', value: '3/10', description: 'Average air quality projections' },
  { label: 'Heat Factor', value: '7/10', description: 'Higher than average summer temperatures' },
];

const paymentBreakdown = [
  { label: 'Principal & interest', amount: '$5,783' },
  { label: 'Mortgage insurance', amount: '$0' },
  { label: 'Property taxes', amount: '$1,516' },
  { label: 'Home insurance', amount: '$396' },
];

const factSections = [
  {
    heading: 'Interior',
    items: ['Bedrooms: 4', 'Bathrooms: 4', 'Full bathrooms: 3', '1/2 bathrooms: 1'],
  },
  {
    heading: 'Living room',
    items: ['Features: Ceiling Fan(s), Fireplace', 'Level: First', 'Dimensions: 17 x 17'],
  },
  {
    heading: 'Kitchen',
    items: ['Features: Granite Counters, Kitchen Island, Pantry', 'Appliances: Double Oven, Range, Wine Cooler', 'Flooring: Tile, Wood'],
  },
];

const propertySections = [
  {
    heading: 'Parking',
    items: ['Total spaces: 3', 'Features: Circular Driveway, EV Charging', 'Attached garage spaces: 3'],
  },
  {
    heading: 'Lot',
    items: ['Size: 0.26 Acres', 'Landscaped subdivision with sprinkler system', 'Residential vegetation: Grassed'],
  },
  {
    heading: 'Features',
    items: ['Private pool with spa', 'Outdoor living cabana and kitchen', 'Smart home upgrades and designer lighting'],
  },
];

const listingIntroText =
  "Welcome home to this beautifully updated retreat with an elegant side-entry garage. From the moment you step through the front door, you're greeted by timeless charm and flexible living spaces.";

const defaultNearbySchools = [
  { name: 'Samuel Beck Elementary School', rating: '9/10', grades: 'PK-5', type: 'Public', distance: '1.3 miles' },
  { name: 'Medlin Middle School', rating: '8/10', grades: '6-8', type: 'Public', distance: '2.0 miles' },
  { name: 'Byron Nelson High School', rating: '8/10', grades: '9-12', type: 'Public', distance: '2.5 miles' },
];

const defaultSchoolNote = 'Elementary: Beck • Middle: Medlin • High: Byron Nelson';

const defaultNeighborhoodNote =
  'Explore local commute times, amenities, and nearby attractions tailored for this property.';

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return new Intl.NumberFormat('en-US').format(value);
}

export default function ListingModal({
  listing,
  onClose,
  assistantUser,
  chatReady,
  chatLoading = false,
  chatError,
  assistantTools,
  onListingContextChange,
}) {
  const heroImages = useMemo(() => {
    const images = listing?.images?.length ? listing.images : [listing?.image ?? heroFallback];
    if (images.length >= 4) {
      return images.slice(0, 4);
    }
    return [...images, ...Array.from({ length: Math.max(0, 4 - images.length) }, () => heroFallback)];
  }, [listing]);

  const listingDetailSnapshot = useMemo(() => buildListingDetailSnapshot(listing), [listing]);
  const listingForContext = useMemo(() => {
    if (!listing) {
      return null;
    }
    if (!listingDetailSnapshot) {
      return listing;
    }
    return { ...listing, chatDetails: listingDetailSnapshot };
  }, [listing, listingDetailSnapshot]);

  const [showChat, setShowChat] = useState(false);
  const primaryAddress = (listing?.displayAddress ?? listing?.name ?? '').trim();
  const chatSubtitleText = primaryAddress || 'Listing address unavailable';

  const chatSubtitleView = useMemo(
    () => (
      <span
        className="cometchat-message-header__subtitle listing-chat__subtitle"
        title={chatSubtitleText}
      >
        {chatSubtitleText}
      </span>
    ),
    [chatSubtitleText],
  );

  const chatIntroMessageView = useMemo(
    () => (
      <p className="listing-chat__intro">
        Ask anything about <strong>{primaryAddress || 'this home'}</strong>.
      </p>
    ),
    [primaryAddress],
  );

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    onListingContextChange?.(listingForContext ?? listing ?? null);
  }, [listing, listingForContext, onListingContextChange]);

  useEffect(() => {
    if (showChat) {
      onListingContextChange?.(listingForContext ?? listing ?? null);
    }
  }, [listing, listingForContext, onListingContextChange, showChat]);

  const formattedPrice = listing?.price ?? '$—';
  const formattedSqft = formatNumber(listing?.livingArea);

  useEffect(() => {
    if (!chatReady || chatLoading || !assistantUser) {
      setShowChat(false);
    }
  }, [assistantUser, chatReady, chatLoading]);

  const handleAskAiClick = () => {
    if (!chatReady || chatLoading || !assistantUser) {
      return;
    }
    setShowChat((prev) => !prev);
  };

  const handleSend = (message) => {

    const text =
      (typeof message?.getText === 'function' && message.getText()) ??
      message?.text ??
      message?.data?.text ??
      '';

    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
      return;
    }

    const activeListing = listingForContext ?? listing ?? null;
    onListingContextChange?.(activeListing);

    const metadata = {
      messageSource: 'react-listing-modal',
    };

    const listingMetadata = activeListing ? buildListingMetadataPayload(activeListing) : null;

    const zpidValue = String(
      activeListing?.zpid ??
        listingMetadata?.zpid ??
        listingMetadata?.listing_zpid ??
        listingMetadata?.zipid ??
        '',
    ).trim();
    if (zpidValue) {
      metadata.zpid = zpidValue;
      metadata.listing_zpid = zpidValue;
      metadata.context = { listing: { zpid: zpidValue } };
    }

    console.debug('[ListingModal] sending chat metadata:', metadata);

    const prefixedText = metadata.zpid ? `[${metadata.zpid}] ${trimmed}` : trimmed;

    if (message instanceof CometChat.TextMessage) {
      if (typeof message.setText === 'function') {
        message.setText(trimmed);
      } else {
        message.text = trimmed;
      }
      message.setMetadata(metadata);
      CometChatUIKit.sendTextMessage(message);
      return;
    }

    const textMessage = new CometChat.TextMessage(
      assistantUser?.uid,
      prefixedText,
      CometChat.RECEIVER_TYPE.USER,
    );
    textMessage.setMetadata(metadata);
    CometChatUIKit.sendTextMessage(textMessage);
  };

  return (
    <div
      className={`listing-modal ${showChat ? 'listing-modal--with-chat' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Listing details"
    >
      <div className="listing-modal__backdrop" onClick={onClose} />
      <div className={`listing-modal__frame ${showChat ? 'listing-modal__frame--chat' : ''}`}>
        <button className="listing-modal__close" type="button" onClick={onClose} aria-label="Close">
            ×
        </button>
        <div className={`listing-modal__dialog ${showChat ? 'listing-modal__dialog--compressed' : ''}`}>
          
          <div className="listing-modal__scroll">
          <header className="listing-modal__hero">
            <div className="listing-modal__hero-primary">
              <img src={heroImages[0]} alt="Primary listing" />
            </div>
            <div className="listing-modal__hero-grid">
              {heroImages.slice(1).map((image, index) => (
                <img key={index} src={image} alt={`Gallery image ${index + 2}`} />
              ))}
              <button className="listing-modal__hero-gallery" type="button" data-demo-toast>
                <span>See all 38 photos</span>
              </button>
            </div>
          </header>

          <div className="listing-modal__body">
            <main className="listing-modal__main">
              <section className="detail-section detail-section--intro">
                <div className="detail-section__meta">
                  <span className="detail-pill">For sale</span>
                  <span className="detail-pill">Single Family Residence</span>
                  <span className="detail-pill">$348/sqft</span>
                </div>
                <h1 className="detail-section__title">{formattedPrice}</h1>
                <p className="detail-section__subtitle">{listing?.displayAddress ?? listing?.name}</p>
                <div className="detail-section__stats">
                  <div className="detail-stat">
                    <strong>{Number.isFinite(listing?.beds) ? listing.beds : '—'}</strong>
                    <span>beds</span>
                  </div>
                  <div className="detail-stat">
                    <strong>{Number.isFinite(listing?.baths) ? listing.baths : '—'}</strong>
                    <span>baths</span>
                  </div>
                  <div className="detail-stat">
                    <strong>{formattedSqft ?? '—'}</strong>
                    <span>sqft</span>
                  </div>
                  <div className="detail-stat">
                    <strong>0.26</strong>
                    <span>Acres lot</span>
                  </div>
                </div>
              </section>

              <section className="detail-section">
                <h2 className="detail-section__heading">Tour with a buyer&apos;s agent</h2>
                <p className="detail-section__lead">
                  We&apos;ll find a local expert to take you on a private tour of this home. Next available tour time:
                  <span> Tomorrow at 11am</span>
                </p>
                <button className="detail-primary-action" type="button" data-demo-toast>
                  See all available times
                </button>
              </section>

              <section className="detail-section">
                <h2 className="detail-section__heading">Facts &amp; features</h2>
                <div className="detail-grid">
                  {factSections.map((section) => (
                    <div key={section.heading}>
                      <h3 className="detail-subheading">{section.heading}</h3>
                      <ul className="detail-list">
                        {section.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-section">
                <h2 className="detail-section__heading">Property</h2>
                <div className="detail-grid">
                  {propertySections.map((section) => (
                    <div key={section.heading}>
                      <h3 className="detail-subheading">{section.heading}</h3>
                      <ul className="detail-list">
                        {section.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-section">
                <h2 className="detail-section__heading">Financial &amp; listing details</h2>
                <div className="detail-grid detail-grid--equal">
                  <div>
                    <ul className="detail-list">
                      <li>Price per square foot: $348</li>
                      <li>Tax assessed value: $996,687</li>
                      <li>Annual tax amount: $17,778</li>
                    </ul>
                  </div>
                  <div>
                    <ul className="detail-list">
                      <li>Date on market: 9/12/2025</li>
                      <li>Cumulative days on market: 13</li>
                      <li>Electric utility on property: Yes</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="detail-section">
                <h2 className="detail-section__heading">BuyAbility payment</h2>
                <div className="detail-payment">
                  <div className="detail-payment__summary">
                    <p className="detail-payment__estimate">Est. $7,695/mo</p>
                    <p>Get personalized insights on what you can afford and pre-qualify instantly.</p>
                    <button className="detail-primary-action" type="button" data-demo-toast>
                      Calculate your BuyAbility
                    </button>
                  </div>
                  <div className="detail-payment__breakdown">
                    <table>
                      <tbody>
                        {paymentBreakdown.map((row) => (
                          <tr key={row.label}>
                            <th scope="row">{row.label}</th>
                            <td>{row.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="detail-section">
                <h2 className="detail-section__heading">Climate risks</h2>
                <div className="detail-climate">
                  {climateFactors.map((factor) => (
                    <div key={factor.label} className="detail-climate__card">
                      <p className="detail-climate__label">{factor.label}</p>
                      <p className="detail-climate__value">{factor.value}</p>
                      <p className="detail-climate__description">{factor.description}</p>
                    </div>
                  ))}
                </div>
                <button className="detail-link" type="button" data-demo-toast>
                  Show more
                </button>
              </section>

              <section className="detail-section">
                <h2 className="detail-section__heading">Price history</h2>
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Event</th>
                      <th scope="col">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>9/12/2025</td>
                      <td>Listed for sale</td>
                      <td>$1,189,000 <span className="detail-price--down">-13.5%</span></td>
                    </tr>
                    <tr>
                      <td>12/19/2023</td>
                      <td>Sold</td>
                      <td>—</td>
                    </tr>
                    <tr>
                      <td>12/13/2023</td>
                      <td>Pending sale</td>
                      <td>$1,375,000</td>
                    </tr>
                    <tr>
                      <td>9/23/2023</td>
                      <td>Listed for sale</td>
                      <td>$1,375,000 <span className="detail-price--up">+161.9%</span></td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="detail-section">
                <h2 className="detail-section__heading">What&apos;s special</h2>
                <div className="detail-tags">
                  {(listing?.highlights ?? defaultHighlights).map((item) => (
                    <span key={item} className="detail-tag">
                      {item}
                    </span>
                  ))}
                </div>
                <p className="detail-section__lead">{listing?.description ?? listingIntroText}</p>
                <button className="detail-link" type="button" data-demo-toast>
                  Show more
                </button>
              </section>

              <section className="detail-section">
                <h2 className="detail-section__heading">Nearby schools</h2>
                <div className="detail-grid detail-grid--equal">
                  <div>
                    <h3 className="detail-subheading">GreatSchools rating</h3>
                    <ul className="detail-list">
                      {(listing?.nearbySchools ?? defaultNearbySchools).map((school) => {
                        const extra = [
                          school.grades ? `Grades ${school.grades}` : null,
                          school.type,
                          school.distance,
                        ]
                          .filter(Boolean)
                          .join(' • ');
                        return (
                          <li key={school.name}>
                            {`${school.name} — ${school.rating}`}
                            {extra ? ` (${extra})` : ''}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div>
                    <h3 className="detail-subheading">Listing agent&apos;s note</h3>
                    <p className="detail-note">{listing?.schoolNote ?? defaultSchoolNote}</p>
                  </div>
                </div>
              </section>

              <section className="detail-section detail-section--footer">
                <h2 className="detail-section__heading">Neighborhood insights</h2>
                <div className="detail-map-placeholder">
                  <span>Interactive map placeholder</span>
                </div>
                <p className="detail-note">{listing?.neighborhoodNote ?? defaultNeighborhoodNote}</p>
              </section>
            </main>

            <aside className="listing-modal__sidebar">
              <div className="sidebar-card">
                <button
                  type="button"
                  className="sidebar-card__ask"
                  onClick={handleAskAiClick}
                  disabled={!chatReady || chatLoading || !assistantUser}
                >
                  {showChat ? 'Close AI chat' : 'Ask AI about this home'}
                </button>
                <button type="button" className="sidebar-card__primary" data-demo-toast>
                  Request a tour
                  <span>As early as tomorrow at 11:00 am</span>
                </button>
                <button type="button" className="sidebar-card__secondary" data-demo-toast>
                  Contact agent
                </button>
              </div>
              <div className="sidebar-card">
                <h3>Services availability</h3>
                <ul className="sidebar-list">
                  <li>
                    <strong>Get pre-qualified</strong>
                    <span>Be ready to make an offer.</span>
                  </li>
                  <li>
                    <strong>Connect with an agent</strong>
                    <span>Get info on this home, tour, and more.</span>
                  </li>
                  <li>
                    <strong>Calculate monthly payment</strong>
                    <span>See if you can afford this home.</span>
                  </li>
                </ul>
              </div>
            </aside>
          </div>

          <footer className="listing-modal__footer">
            <p>
              Zillow Group is committed to ensuring digital accessibility for individuals with disabilities. We welcome
              feedback and accommodation requests.
            </p>
            <nav className="listing-modal__footer-links">
              <a href="#">Do Not Sell or Share My Personal Information</a>
              <a href="#">Contact Zillow, Inc. Brokerage</a>
              <a href="#">Fair Housing Guide</a>
            </nav>
            <p className="listing-modal__footer-meta">© {new Date().getFullYear()} Zillow. All rights reserved.</p>
          </footer>
        </div>
      </div>
        {showChat ? (
          <aside className="listing-chat-panel" role="region" aria-label="Listing AI assistant">
          
            <div className="listing-chat-panel__body">
              {chatError && (!chatReady || !assistantUser) ? (
                <p className="listing-chat__status">{chatError}</p>
              ) : chatReady && assistantUser ? (
                <CometChatAIAssistantChat
                  key={listing?.zpid ?? listing?.detailUrl ?? 'listing-modal-chat'}
                  user={assistantUser}
                  showCloseButton={true}
                  onCloseButtonClicked={() => setShowChat(false)}
                  //aiAssistantTools={assistantTools}
                  onSendButtonClick={handleSend}
                  headerSubtitleView={chatSubtitleView}
                  emptyChatIntroMessageView={chatIntroMessageView}
                />
              ) : (
                <p className="listing-chat__status">
                  {chatLoading ? 'Connecting to CometChat…' : 'Preparing chat…'}
                </p>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
