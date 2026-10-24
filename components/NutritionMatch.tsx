'use client'

import { useState } from 'react'
import { Heart, Activity, Brain, Sparkles, ShieldCheck, ArrowRight, Zap } from 'lucide-react'
import { useLanguage } from './LanguageProvider'

type Product = { id: number; name: string; type: string; price: number; color: string; image: string; detail: string }
type FeaturedType = 'Almonds' | 'Walnuts'

const FEATURED_PAIR: Array<{ productType: FeaturedType; nutrient: string }> = [
  { productType: 'Almonds', nutrient: 'Plant Protein, Vitamin E & Magnesium' },
  { productType: 'Walnuts', nutrient: 'Omega-3 ALA & Natural Polyphenols' },
]

const WELLNESS_GOALS = [
  {
    id: 'energy',
    title: 'Energy & Stamina',
    icon: Zap,
    badge: 'Active Lifestyle',
    headline: 'Sustained energy without the sugar crash',
    description: 'A satisfying daily pairing of plant protein and naturally occurring healthy fats to support your on-the-go routine.',
    ritual: 'Pair a small handful with fruit or yoghurt for a balanced afternoon snack.',
    recommended: FEATURED_PAIR,
    stats: [
      { value: 'Plant', label: 'Protein' },
      { value: 'Good', label: 'Fats' },
      { value: 'Whole', label: 'Nuts' },
    ],
  },
  {
    id: 'heart',
    title: 'Heart & Cholesterol',
    icon: Heart,
    badge: 'Cardio Wellness',
    headline: 'Nourish your vascular health naturally',
    description: 'Walnuts and almonds bring naturally occurring unsaturated fats to a thoughtful everyday snack ritual.',
    ritual: 'Enjoy them plain, unsalted, or folded into your breakfast bowl.',
    recommended: FEATURED_PAIR,
    stats: [
      { value: 'ALA', label: 'Omega-3' },
      { value: 'Good', label: 'Fats' },
      { value: 'Daily', label: 'Ritual' },
    ],
  },
  {
    id: 'brain',
    title: 'Brain & Memory',
    icon: Brain,
    badge: 'Cognitive Focus',
    headline: 'Sharpen mental clarity & focus',
    description: 'Walnuts and almonds are a naturally rich source of omega-3 ALA, Vitamin E, and satisfying texture.',
    ritual: 'Keep a small portion at your desk for a mindful mid-day break.',
    recommended: FEATURED_PAIR,
    stats: [
      { value: 'Vit E', label: 'Natural Source' },
      { value: 'ALA', label: 'Omega-3' },
      { value: 'Mindful', label: 'Snack' },
    ],
  },
  {
    id: 'skin',
    title: 'Glow & Anti-Aging',
    icon: Sparkles,
    badge: 'Radiant Skin',
    headline: 'Hydrate skin from within with natural oils',
    description: 'A simple whole-food pair with Vitamin E, minerals, and good fats for a nourishing daily routine.',
    ritual: 'Add a few crushed almonds and walnuts to oats, salads, or warm porridge.',
    recommended: FEATURED_PAIR,
    stats: [
      { value: 'Vit E', label: 'Natural Source' },
      { value: 'Mineral', label: 'Rich' },
      { value: 'Everyday', label: 'Goodness' },
    ],
  },
]

export default function NutritionMatch({
  products,
  onSelectProduct,
  go,
}: {
  products: Product[]
  onSelectProduct: (p: Product) => void
  go: (view: any) => void
}) {
  const { t } = useLanguage()
  const [activeGoalId, setActiveGoalId] = useState('energy')
  const activeGoal = WELLNESS_GOALS.find((g) => g.id === activeGoalId) || WELLNESS_GOALS[0]
  const recommendedProducts = activeGoal.recommended.flatMap((recommendation) => {
    const product = products.find((item) => item.type === recommendation.productType)
    return product ? [{ ...product, nutrient: recommendation.nutrient }] : []
  })

  return (
    <div className="nutrition-match-container">
      <div className="section-head text-center">
        <div>
          <p className="eyebrow justify-center">
            <Activity size={14} /> {t('Personalised Wellness')}
          </p>
          <h2>
            {t('Find Your')} <em>{t('Superfood Match')}</em>
          </h2>
        </div>
        <p className="section-intro text-center">
          {t('What is your health focus today? Pick a goal to discover nutrients tailored to your body.')}
        </p>
      </div>

      {/* Goal Selector Tabs */}
      <div className="wellness-tabs">
        {WELLNESS_GOALS.map((goal) => {
          const GoalIcon = goal.icon
          const isActive = goal.id === activeGoalId
          return (
            <button
              key={goal.id}
              type="button"
              className={`wellness-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveGoalId(goal.id)}
            >
              <GoalIcon size={18} />
              <span>{t(goal.title)}</span>
            </button>
          )
        })}
      </div>

      {/* Active Goal Showcase Display */}
      <div className="wellness-display-card">
        <div className="display-copy">
          <div className="display-badge">
            <ShieldCheck size={14} /> <span>{t(activeGoal.badge)}</span>
          </div>
          <h3>{t(activeGoal.headline)}</h3>
          <p>{t(activeGoal.description)}</p>

          <div className="wellness-ritual">
            <span>{t("Today's ritual")}</span>
            <p>{t(activeGoal.ritual)}</p>
          </div>

          <div className="goal-stats-row">
            {activeGoal.stats.map((s) => (
              <div key={s.label} className="goal-stat-item">
                <strong>{t(s.value)}</strong>
                <span>{t(s.label)}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="button button-dark"
            onClick={() => go('product')}
          >
            {t('Explore Wellness Collection')} <ArrowRight size={16} />
          </button>
        </div>

        <div className="display-recommendations">
          <h4 className="rec-title">{t('Recommended Superfoods')}</h4>
          <div className="rec-cards-list">
            {recommendedProducts.map((item) => (
              <div key={item.name} className="rec-product-card">
                <div className="rec-img">
                  <img src={item.image} alt={t(item.name)} />
                </div>
                <div className="rec-info">
                  <span className="rec-tag">{t(item.type)}</span>
                  <h5>{t(item.name)}</h5>
                  <p className="rec-nutrient">
                    <Sparkles size={12} /> {t(item.nutrient)}
                  </p>
                  <div className="rec-action-row">
                    <span className="rec-price">₹{item.price}</span>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        onSelectProduct(item)
                      }}
                    >
                      {t('View Details')} <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
