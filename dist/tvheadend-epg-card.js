class TVHeadendEPGCard extends HTMLElement {

  setConfig(config) {
    this.config = { hours: 4, rowHeight: 52, ...config };
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this._fetchEPG();
  }

  set hass(hass) {
    this._hass = hass;
  }

  async _fetchEPG() {
    const result = await this._hass.connection.sendMessagePromise({
      type: "tvheadend_epg/get"
    });
    this._epg = result;
    this._render();
  }

  _render() {
    if (!Array.isArray(this._epg)) return;

    const now = Date.now() / 1000;
    const start = Math.floor(now / 3600) * 3600;
    const end = start + this.config.hours * 3600;
    const px = 120 / 3600;

    const channels = {};
    this._epg.forEach(e => {
      channels[e.channelName] ??= [];
      channels[e.channelName].push(e);
    });

    this.innerHTML = `
      <ha-card header="Műsorújság">
        <style>
          .epg { display:flex }
          .channels { width:180px }
          .ch { height:${this.config.rowHeight}px; padding:6px }
          .timeline { flex:1; overflow:auto; position:relative }
          .row { height:${this.config.rowHeight}px; position:relative }
          .event {
            position:absolute;
            background:var(--primary-color);
            color:white;
            border-radius:6px;
            padding:4px;
            font-size:12px;
          }
          .live { background:var(--accent-color) }
          .now {
            position:absolute;
            width:2px;
            background:red;
            top:0; bottom:0;
            left:${(now-start)*px}px;
          }
        </style>

        <div class="epg">
          <div class="channels">
            ${Object.keys(channels).map(c => `<div class="ch">${c}</div>`).join("")}
          </div>
          <div class="timeline">
            <div class="now"></div>
            ${Object.values(channels).map(events => `
              <div class="row">
                ${events
                  .filter(e => e.stop > start && e.start < end)
                  .map(e => {
                    const l = Math.max(e.start, start);
                    const r = Math.min(e.stop, end);
                    return `
                      <div class="event ${e.start <= now && e.stop >= now ? "live" : ""}"
                           style="left:${(l-start)*px}px;width:${(r-l)*px}px">
                        ${e.title}
                      </div>`;
                  }).join("")}
              </div>`).join("")}
          </div>
        </div>
      </ha-card>
    `;
  }

  getCardSize() {
    return 12;
  }
}

customElements.define("tvheadend-epg-card", TVHeadendEPGCard);
