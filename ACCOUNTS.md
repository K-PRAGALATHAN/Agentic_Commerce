# Demo accounts

Every account below uses the password **`demo1234`**.

Rebuild them at any time — the script is idempotent, and it resets these
passwords back to the demo one if anybody changes them:

```
docker compose exec backend npx tsx src/scripts/seed-demo.ts
```

> These are fixtures for a **test-mode** store. Razorpay runs on test keys and no
> real money moves. Do not reuse this password anywhere that matters.

---

## Merchants — four storefronts

| Store | Login | Sells | Products | Units sold | Revenue |
|---|---|---|---|---|---|
| ⚡ **Nova Tech** | `nova@demo.store` | Laptops, phones, accessories | 13 | 9 | ₹9,696 |
| 🌿 **Aster and Vine** | `aster@demo.store` | Clothing, watches, beauty, scent | 32 | 34 | ₹45,111 |
| 🧺 **Fresh Basket** | `basket@demo.store` | Groceries and daily essentials | 31 | 26 | ₹1,811 |
| 🏡 **Kalyani Home and Living** | `acbde@gmail.com` | Kitchen, furniture, home décor | 40 | 33 | ₹1,850 |

**Kalyani is the exception:** it is the original catalogue owner and pre-dates
this seed, so its password is whatever it always was — the script does not touch
it. The other three are `demo1234`.

Public store pages (no login needed):

- `/stores` — the directory
- `/stores/nova-tech`
- `/stores/aster-and-vine`
- `/stores/fresh-basket`
- `/stores/kalyani-home-and-living`

## Customers

| Login | Shopping history |
|---|---|
| `riya@demo.shop` | Orders across all four stores — the best one for the storefront rows |
| `arjun@demo.shop` | Electronics and groceries |
| `meera@demo.shop` | Fashion and home |

All three have paid orders behind them, so "Buy it again", "Recommended for you"
and "Trending now" have real data rather than an empty state.

---

## What each account is good for in a demo

**Sign in as `riya@demo.shop`** for the customer story. The home page is a full
landing page — hero, categories, the four stores, best-rated products — and every
product card names the store selling it. Clicking that name opens the store's own
page with its sales figures.

**Sign in as `nova@demo.store`** for the merchant story. Products, **+ Add
product**, the shopfront editor (the store name customers see), payouts, the LLM
cost tracker and the wiki the assistant reads.

**Cross-store carts are the interesting case.** Add a shirt from Aster and Vine
and a charger from Nova Tech to the same cart: one payment, split across two
merchants, prorated after the discount. That path is what the Route payout ledger
exists for.

---

## Roles

Merchants and customers see different applications. A merchant has no cart, and
"Orders" means sales rather than purchases — so a customer account will never
find the Products page, and typing `/merchant` redirects away from it. If a
screen seems to be missing, check which of the two you are signed in as.

Anyone can create either kind from the login screen: **Sign up → Account type**.
