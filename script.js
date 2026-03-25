document.addEventListener("DOMContentLoaded", () => {

  // -------------------------
  // CLOCK
  // -------------------------
  const clock = document.getElementById("clock")
  if (clock) {
    function updateClock() {
      const now = new Date()
      clock.textContent = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    }
    setInterval(updateClock, 1000)
    updateClock()
  }

  // -------------------------
  // SEARCH + GOOGLE SUGGEST
  // -------------------------
  const search = document.getElementById("search")
  const suggestionsContainer = document.createElement("div")
  suggestionsContainer.className = "suggestions"
  search.parentNode.appendChild(suggestionsContainer)

  search.addEventListener("input", async () => {
    const query = search.value
    if (!query) {
      suggestionsContainer.innerHTML = ""
      return
    }
    try {
      const res = await fetch(
        `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`
      )
      const data = await res.json()
      const suggestions = data[1] || []
      suggestionsContainer.innerHTML = suggestions
        .map(s => `<div class="suggestion-item">${s}</div>`)
        .join("")
      document.querySelectorAll(".suggestion-item").forEach(item => {
        item.addEventListener("click", () => {
          search.value = item.textContent
          window.location.href =
            `https://www.google.com/search?q=${encodeURIComponent(item.textContent)}`
        })
      })
    } catch (err) {
      console.error("Suggest error:", err)
    }
  })

  search.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const query = encodeURIComponent(search.value)
      window.location.href = `https://www.google.com/search?q=${query}`
    }
  })

  // -------------------------
  // LOCAL STORAGE MANAGEMENT
  // -------------------------
  function getSeenPosts() {
    const stored = localStorage.getItem("seenPosts")
    return stored ? JSON.parse(stored) : []
  }

  function saveSeenPosts(ids) {
    const seen = new Set(getSeenPosts())
    ids.forEach(id => seen.add(id))
    localStorage.setItem("seenPosts", JSON.stringify([...seen].slice(-500)))
  }

  function getClickedPosts() {
    const stored = localStorage.getItem("clickedPosts")
    return stored ? JSON.parse(stored) : []
  }

  function saveClickedPost(link) {
    const clicked = new Set(getClickedPosts())
    clicked.add(link)
    localStorage.setItem("clickedPosts", JSON.stringify([...clicked].slice(-500)))
  }

  function getRemovedCards() {
    const stored = JSON.parse(localStorage.getItem("removedCards") || "[]")
    const now = Date.now()
    // Remove items older than 1 day
    const valid = stored.filter(r => now - r.time <= 24 * 60 * 60 * 1000)
    localStorage.setItem("removedCards", JSON.stringify(valid))
    return new Set(valid.map(r => r.link))
  }

  function saveRemovedCard(link) {
    const stored = JSON.parse(localStorage.getItem("removedCards") || "[]")
    const now = Date.now()
    // Keep only recent + new
    const filtered = stored.filter(r => now - r.time <= 24 * 60 * 60 * 1000)
    filtered.push({ link, time: now })
    localStorage.setItem("removedCards", JSON.stringify(filtered.slice(-500)))
  }

  // -------------------------
  // NORMALIZE POSTS
  // -------------------------
  function normalizePost(item, sourceName, sourceDays) {
  let img = "";
  if(sourceName == "Media Gratiae")
    console.log(item);
  // 1. Try direct thumbnail
  if (item.thumbnail) img = item.thumbnail;

  // 2. Try media:thumbnail
  if (!img && item.media && item.media.thumbnail) img = item.media.thumbnail;
  if (!img && item["media:thumbnail"] && item["media:thumbnail"].url) img = item["media:thumbnail"].url;

  // 3. Try <img> tag in description/content
  const html = item.description || item.content || "";
  if (!img) {
    const match = html.match(/<img[^>]+>/i);
    if (match) {
      const imgTag = match[0];

      // Prefer data-image attribute if present
      const dataImageMatch = imgTag.match(/data-image=["'](.*?)["']/i);
      if (dataImageMatch) {
        img = dataImageMatch[1];
      } else {
        // Fallback to src
        const srcMatch = imgTag.match(/src=["'](.*?)["']/i);
        if (srcMatch) img = srcMatch[1];
      }
    }
  }

  // 4. Try enclosure link
  if (!img && item.enclosure && item.enclosure.link) img = item.enclosure.link;

  // 5. Try media:content (some feeds)
  if (!img && item["media:content"] && item["media:content"].url) img = item["media:content"].url;

  // 6. Ensure it's an image (not mp3)
  if (img && !img.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)/i)) {
    img = ""; // Not an image
  }

  const categories = item.categories ? (Array.isArray(item.categories) ? item.categories : [item.categories]) : []
  const itemTitle = item.title.includes(":") && item.title.length > 100
  ? item.title.slice(0, item.title.indexOf(":")) 
  : item.title;
  return {
    title: itemTitle || "Untitled",
    link: item.link,
    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
    description: html,
    thumbnail: img,
    source: sourceName,
    author: item.author,
    type: categories.length ? categories[0] : "",
    sourceDays,
    extraInfo: ""
  }
}

  // -------------------------
  // REMOVE DUPLICATES
  // -------------------------
  function removeDuplicates(posts) {
    const seen = new Set()
    return posts.filter(post => {
      const key = post.link.split("?")[0]
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  // -------------------------
  // LIMIT 0–1 A LA CARTE
  // -------------------------
  function limitChalliesALaCarte(posts) {
    let kept = 0
    return posts.filter(post => {
      if (limitPost(post, "Challies", "a la carte")) {
        if (kept === 0 && Math.random() < 0.5) {
          kept++
          return true
        }
        return false
      }
      if(limitPost(post, "Media Gratiae", "","The Whole Counsel")) {
        return false
      }
      return true
    })
  }

  function limitPost(post, source, title) {
    return post.source === source &&
        post.title &&
        post.title.toLowerCase().includes(title)
  }

  function limitPost(post, source, title, type) {
    return post.source === source &&
        post.title &&
        post.title.toLowerCase().includes(title) &&
        post.type && post.type== type
  }

  // -------------------------
  // LIMIT PER SOURCE
  // -------------------------
  function limitPerSource(posts, limit = 3) {
    const counts = {}
    return posts.filter(post => {
      counts[post.source] = counts[post.source] || 0
      if (counts[post.source] >= limit) return false
      counts[post.source]++
      return true
    })
  }

  // -------------------------
  // RANK POSTS (UPDATED TO USE sourceDays)
  // -------------------------
  function rankPosts(posts) {
    const seen = new Set(getSeenPosts())
    const clicked = new Set(getClickedPosts())
    const removed = getRemovedCards()
    const now = Date.now()
    return posts
      .filter(post => !removed.has(post.link))
      .map(post => {
        const ageHours = (now - new Date(post.pubDate)) / (1000 * 60 * 60)
        const withinSourceDays = ageHours <= post.sourceDays * 24
        const isSeen = seen.has(post.link)
        const isClicked = clicked.has(post.link)
        let score = 0
        if (withinSourceDays) score += 3
        if (!isSeen) score += 2
        score += Math.max(0, 1 - ageHours / (post.sourceDays * 24))
        if (
          post.source === "Challies" &&
          post.title.toLowerCase().includes("a la carte")
        ) score -= 1
        if (isClicked) score -= 1.5
        score += Math.random()
        return { post, score }
      })
      .sort((a, b) => b.score - a.score)
      .map(x => x.post)
  }

  // -------------------------
  // FETCH FEED
  // -------------------------
  async function loadFeed(url, sourceName, days) {
    try {
      const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`
      const res = await fetch(api)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (!data.items) throw new Error()
      return data.items.slice(0, 15).map(item => normalizePost(item, sourceName, days))
    } catch {
      console.warn(`Feed failed: ${url}, skipping.`)
      return []
    }
  }

  // -------------------------
  // LOAD ALL FEEDS
  // -------------------------
  async function loadAllFeeds() {
    const container = document.getElementById("all-feeds")
    if (!container) return
    container.innerHTML = "<p>Loading feeds...</p>"

    const feedSources =  [
      { url: "https://www.challies.com/feed/", name: "Challies", days: 3 },
      { url: "https://www.thegospelcoalition.org/feed/", name: "TGC", days: 3 },
      { url: "https://www.evangelical-times.org/rss/", name: "ET", days: 5 },
      { url: "https://www.crossway.org/articles/rss/", name: "Crossway", days: 3 },
      { url: "https://www.christian.org.uk/news/england-wales/rssfeed/", name: "CI", days: 7 },
      { url: "https://www.mediagratiae.org/blog?format=rss", name: "Media Gratiae", days: 14 },
      { url: "https://www.ligonier.org/rss.xml", name: "Ligonier", days: 2}
    ];

    try {
      const allItemsArrays = await Promise.all(
        feedSources.map(f => loadFeed(f.url, f.name, f.days))
      )
      const flatArr = allItemsArrays.flat()

      // FILTER POSTS BY SOURCE-SPECIFIC DAYS
      const now = new Date()
      const recentItems = flatArr.filter(post => {
        const postDate = new Date(post.pubDate)
        const cutoff = new Date()
        cutoff.setDate(now.getDate() - post.sourceDays)
        return postDate >= cutoff
      })

      const allItems =
        limitPerSource(
          rankPosts(
            limitChalliesALaCarte(
              removeDuplicates(recentItems)
            )
          )
        ).slice(0, 9)

      saveSeenPosts(allItems.map(x => x.link))
      container.innerHTML = ""

      allItems.forEach(post => {
        let imgSrc = post.thumbnail
        if (!imgSrc) {
          const match = post.description.match(/<img.*?src="(.*?)"/)
          if (match && match[1]) imgSrc = match[1]
        }
        console.log(post)

        const card = document.createElement("div")
        card.className = "card"
        card.style.position = "relative" // allow absolute button
        const date = new Date(post.pubDate)
        const ukDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(date)

        card.innerHTML = `
          <button class="remove-btn">&times;</button>
          <a href="${post.link}" target="_blank">
            ${imgSrc ? `<img src="${imgSrc}" alt="${post.title}" class="card-img">` : ""}
            <h3>${post.title}</h3>
            <p class="source">${post.source}${post.type ? " - " + post.type : ""}</p>
            <p>${post.author ? post.author + " - " : ""}${ukDate}</p>
          </a>
        `

        // Track clicks for priority adjustment
        card.querySelector("a").addEventListener("click", () => {
          saveClickedPost(post.link)
        })

        // Remove button
        card.querySelector(".remove-btn").addEventListener("click", () => {
          saveRemovedCard(post.link)
          card.remove()
        })

        container.appendChild(card)
      })

    } catch (err) {
      container.innerHTML = `<p class="feed-error">Unable to load feeds</p>`
      console.error(err)
    }
  }

  loadAllFeeds()
})