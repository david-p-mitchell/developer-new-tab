const clock = document.getElementById("clock")

function updateClock() {
  const now = new Date()
  clock.textContent = now.toLocaleTimeString()
}

setInterval(updateClock, 1000)
updateClock()

const search = document.getElementById("search")

search.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const query = encodeURIComponent(search.value)
    window.location.href = `https://www.google.com/search?q=${query}`
  }
})