document.addEventListener("DOMContentLoaded", () => {

  // CLOCK with seconds
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

  // SEARCH + GOOGLE AUTO-SUGGEST
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
          window.location.href = `https://www.google.com/search?q=${encodeURIComponent(item.textContent)}`
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

  // FETCH SINGLE FEED
  async function loadFeed(url, sourceName) {
    const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`
    const res = await fetch(api)
    if (!res.ok) throw new Error("Feed request failed")
    const data = await res.json()
    if (!data.items || !Array.isArray(data.items)) return []
    return data.items.map(item => ({ ...item, source: sourceName }))
  }

  // LOAD ALL FEEDS AND COMBINE
  async function loadAllFeeds() {
    const container = document.getElementById("all-feeds")
    if (!container) return
    container.innerHTML = "<p>Loading feeds...</p>"

    const feedSources = [
      { url: "https://www.challies.com/feed/", name: "Challies" },
      { url: "https://www.thegospelcoalition.org/feed/", name: "TGC" }
    ]

    try {
      const allItemsArrays = await Promise.all(
        feedSources.map(f => loadFeed(f.url, f.name))
      )

      const allItems = allItemsArrays.flat()
        .sort((a,b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0,6)

      container.innerHTML = ""

      allItems.forEach(post => {
        let imgSrc = post.thumbnail
        if (!imgSrc) {
          const match = post.description.match(/<img.*?src="(.*?)"/)
          if (match && match[1]) imgSrc = match[1]
        }

        const card = document.createElement("div")
        card.className = "card"
        card.innerHTML = `
          <a href="${post.link}" target="_blank">
            ${imgSrc ? `<img src="${imgSrc}" alt="${post.title}" class="card-img">` : ""}
            <h3>${post.title}</h3>
            <p class="source">${post.source}</p>
            <p>${new Date(post.pubDate).toDateString()}</p>
          </a>
        `
        container.appendChild(card)
      })

    } catch (err) {
      container.innerHTML = `<p class="feed-error">Unable to load feeds</p>`
      console.error(err)
    }
  }

  loadAllFeeds()
})