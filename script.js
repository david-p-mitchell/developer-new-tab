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
  function normalizePost(item, sourceName) {
  let img = item.thumbnail || ""
  const html = item.description || item.content || ""
  if (!img) {
    const match = html.match(/<img.*?src="(.*?)"/i)
    if (match) img = match[1]
  }
  if (!img && item.enclosure && item.enclosure.link) img = item.enclosure.link

  // Special handling for Evangelical Times
  
  let extraInfo = ""
  const categories = item.categories ? (Array.isArray(item.categories) ? item.categories : [item.categories]) : []
  
  return {
    title: item.title || "Untitled",
    link: item.link,
    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
    description: html,
    thumbnail: img,
    source: sourceName,
    author: item.author,
    type: categories.length ? categories[0] : "",
    extraInfo // for ET category + creator
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
      if (
        post.source === "Challies" &&
        post.title &&
        post.title.toLowerCase().includes("a la carte")
      ) {
        if (kept === 0 && Math.random() < 0.5) {
          kept++
          return true
        }
        return false
      }
      return true
    })
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
  // RANK POSTS
  // -------------------------
  function rankPosts(posts) {
    const seen = new Set(getSeenPosts())
    const clicked = new Set(getClickedPosts())
    const removed = getRemovedCards()
    const now = Date.now()
    return posts
      .filter(post => !removed.has(post.link)) // remove hidden cards
      .map(post => {
        const ageHours = (now - new Date(post.pubDate)) / (1000 * 60 * 60)
        const within3Days = ageHours <= 72
        const isSeen = seen.has(post.link)
        const isClicked = clicked.has(post.link)
        let score = 0
        if (within3Days) score += 3
        if (!isSeen) score += 2
        score += Math.max(0, 1 - ageHours / 168)
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
  async function loadFeed(url, sourceName) {
    try {
      const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`
      const res = await fetch(api)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (!data.items) throw new Error()
      return data.items.slice(0, 15).map(item => normalizePost(item, sourceName))
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

    const feedSources = [
      { url: "https://www.challies.com/feed/", name: "Challies" },
      { url: "https://www.thegospelcoalition.org/feed/", name: "TGC" },
      { url: "https://www.evangelical-times.org/rss/", name: "ET" },
      { url: "https://www.crossway.org/articles/rss/", name: "Crossway" },
      { url: "https://www.christian.org.uk/news/england-wales/rssfeed/", name: "CI" }
    ]

    try {
      const allItemsArrays = await Promise.all(
        feedSources.map(f => loadFeed(f.url, f.name))
      )

      const allItems =
        limitPerSource(
          rankPosts(
            limitChalliesALaCarte(
              removeDuplicates(allItemsArrays.flat())
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

        const card = document.createElement("div")
        card.className = "card"
        card.style.position = "relative" // allow absolute button
        console.log(post.extraInfo, "Hi")
        const date = new Date(post.pubDate);
        const ukDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(date);

        card.innerHTML = `
          <button class="remove-btn">&times;</button>
          <a href="${post.link}" target="_blank">
            ${imgSrc ? `<img src="${imgSrc}" alt="${post.title}" class="card-img">` : ""}
            <h3>${post.title}</h3>
            <p class="source">${post.source}${post.type ? " - " + post.type : ""}</p>
            <p>${post.author ? post.author + " - " : ""}${ukDate}</p>
          </a>
        `;

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