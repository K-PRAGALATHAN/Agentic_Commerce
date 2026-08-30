"""Map what a shopper says to what the catalogue actually calls things.

"fruits" matches no product name and no category — the category is "groceries" —
so a literal search returns nothing while 27 grocery items sit right there. This
module is the bridge, and it lives on its own because BOTH the tool-calling loop
and the keyless fallback agent need it. It used to exist only inside the old
pipeline, which is how the tool loop silently lost it.
"""
import re

# Sub-category terms -> specific PRODUCT keywords. Needed because the demo data
# lumps all food under one "groceries" category, so "fruits" has to be resolved
# by product name, not by category.
KEYWORD_GROUPS: dict[str, list[str]] = {
    "fruit": ["apple", "banana", "kiwi", "orange", "mango", "strawberry", "grape",
              "mulberry", "lemon", "pineapple", "cherry", "pomegranate"],
    "vegetable": ["potato", "onion", "cucumber", "tomato", "carrot", "chili",
                  "pepper", "cabbage", "spinach", "broccoli", "beans"],
    "drink": ["juice", "soda", "water", "coffee", "tea", "milk", "soft drink", "cola"],
    "beverage": ["juice", "soda", "water", "coffee", "tea", "milk", "soft drink"],
    "meat": ["chicken", "beef", "steak", "fish", "mutton", "pork", "lamb"],
    "dairy": ["milk", "cheese", "butter", "yogurt", "egg"],
    "snack": ["chips", "cookie", "chocolate", "ice cream", "biscuit", "honey"],
}

# Coarse everyday term -> the real category slug.
SYNONYMS: dict[str, str] = {
    "food": "groceries", "grocery": "groceries", "groceries": "groceries",
    "fruits": "groceries", "vegetables": "groceries",
    "perfume": "fragrances", "perfumes": "fragrances", "scent": "fragrances",
    "cologne": "fragrances", "fragrance": "fragrances",
    "makeup": "beauty", "cosmetic": "beauty", "cosmetics": "beauty",
    "skincare": "beauty", "beauty": "beauty",
    "chair": "furniture", "table": "furniture", "bed": "furniture", "sofa": "furniture",
    "furnitures": "furniture", "furniture": "furniture",
    "phone": "smartphones", "mobile": "smartphones", "smartphone": "smartphones",
    "gadget": "mobile-accessories", "gadgets": "mobile-accessories",
    "tech": "mobile-accessories", "electronics": "mobile-accessories",
    "accessory": "mobile-accessories", "accessories": "mobile-accessories",
    "headphone": "mobile-accessories", "headphones": "mobile-accessories",
    "earphone": "mobile-accessories", "earbuds": "mobile-accessories",
    "laptop": "laptops", "laptops": "laptops", "computer": "laptops",
    "shirt": "mens-shirts", "shirts": "mens-shirts", "tshirt": "mens-shirts", "tee": "mens-shirts",
    "shoe": "mens-shoes", "shoes": "mens-shoes", "sneaker": "mens-shoes", "sneakers": "mens-shoes",
    "watch": "mens-watches", "watches": "mens-watches",
    "sunglass": "sunglasses", "sunglasses": "sunglasses",
    "tablet": "tablets", "tablets": "tablets",
    "kitchen": "kitchen-accessories", "cookware": "kitchen-accessories",
    "decor": "home-decoration", "decoration": "home-decoration",
}


def resolve(term: str, categories: list[str]) -> tuple[list[str], list[str]]:
    """Return (matching categories, product keywords) for a shopper's phrase.

    Whole-WORD matching throughout — a substring match for "table" fires inside
    "vege(table)s" and returns furniture, which is a bug this repo has already
    shipped once.
    """
    words = set(re.findall(r"[a-z]+", term.lower()))

    # 1. Sub-category keyword groups take priority: they are the precise ones.
    keywords: list[str] = []
    for w in words:
        key = w[:-1] if (w.endswith("s") and w[:-1] in KEYWORD_GROUPS) else w  # fruits -> fruit
        if key in KEYWORD_GROUPS:
            keywords.extend(KEYWORD_GROUPS[key])
    if keywords:
        # Scope to groceries so a fruit keyword like "apple" cannot match the
        # brand in "Apple AirPods".
        scope = ["groceries"] if "groceries" in categories else []
        return scope, list(dict.fromkeys(keywords))

    # 2. Otherwise coarse category synonyms.
    resolved: list[str] = []
    for word, cat in SYNONYMS.items():
        if word in words and cat in categories and cat not in resolved:
            resolved.append(cat)
    # 3. The term may simply BE a category.
    for c in categories:
        if c.lower() in words and c not in resolved:
            resolved.append(c)
    return resolved, []
