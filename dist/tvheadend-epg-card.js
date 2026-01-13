class TvheadendEpgCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._hass = null;
    this._epg = [];
    this._entryId = null;

    this.PX_PER_MIN = 4;
    this.CHANNEL_COL_WIDTH = 150;
    this.ROW_HEIGHT = 72;
    this.CARD_GAP = 6; // px – garantált rés

    this.WINDOW_BEFORE = 3 * 3600;
    this.WINDOW_AFTER = 6 * 3600;

    this._now = Math.floor(Date.now() / 1000);
    this._interval = setInterval(() => {
      this._now = Math.floor(Date.now() / 1000);
      this._render();
    }, 60000);
  }

  disconnectedCallback() {
    clearInterval(this._interval);
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._entryId && hass) this._resolveEntryId();
  }

  async _resolveEntryId() {
    const entries = await this._hass.connection.sendMessagePromise({
      type: "config_entries/get",
      domain: "tvheadend_epg",
    });
    if (!entries?.length) return;
    this._entryId = entries[0].entry_id;
    this._fetchEpg();
  }

  async _fetchEpg() {
    const result = await this._hass.connection.sendMessagePromise({
      type: "tvheadend_epg/fetch",
      entry_id: this._entryId,
    });
    this._epg = result.epg || [];
    this._render();
  }

  _render() {
    if (!this.shadowRoot || !this._epg.length) return;

    const viewStart = this._now - this.WINDOW_BEFORE;
    const viewEnd = this._now + this.WINDOW_AFTER;
    const gridWidth = ((viewEnd - viewStart) / 60) * this.PX_PER_MIN;

    const style = `
      <style>
        ha-card {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .header {
          padding: 12px 16px;
          font-size: 18px;
          font-weight: 600;
          border-bottom: 1px solid var(--divider-color);
        }

        .container {
          display: flex;
          overflow: auto;
          flex: 1;
        }

        .channels {
          position: sticky;
          left: 0;
          background: var(--card-background-color);
          min-width: ${this.CHANNEL_COL_WIDTH}px;
          border-right: 1px solid var(--divider-color);
          z-index: 2;
        }

        .channel {
          height: ${this.ROW_HEIGHT}px;
          display: flex;
          align-items: center;
          padding: 0 8px;
          font-weight: 600;
          border-bottom: 1px solid var(--divider-color);
        }

        .grid {
          position: relative;
          width: ${gridWidth}px;
        }

        .row {
          position: relative;
          height: ${this.ROW_HEIGHT}px;
          border-bottom: 1px solid var(--divider-color);
        }

        .event {
          position: absolute;
          top: 8px;
          height: ${this.ROW_HEIGHT - 16}px;
          padding: 6px 8px;
          border-radius: 10px;
          background: var(--primary-color);
          color: white;
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          box-shadow: 0 1px 3px rgba(0,0,0,.35);
        }

        .event.current {
          background: var(--accent-color);
        }

        .now-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--error-color);
          z-index: 5;
        }
      </style>
    `;

    /* ---------- CSATORNÁK CSOPORTOSÍTÁSA ---------- */
    const byChannel = {};
    for (const e of this._epg) {
      if (e.stop < viewStart || e.start > viewEnd) continue;
      byChannel[e.channelUuid] ??= {
        number: Number(e.channelNumber),
        name: e.channelName,
        events: [],
      };
      byChannel[e.channelUuid].events.push(e);
    }

    const channels = Object.values(byChannel).sort((a, b) => a.number - b.number);

    /* ---------- SOROK RENDERELÉSE ÜTKÖZÉSVÉDELEMMEL ---------- */
    const rows = channels.map(c => {
      c.events.sort((a, b) => a.start - b.start);

      let lastRight = -Infinity;

      const blocks = c.events.map(e => {
        const rawLeft = ((e.start - viewStart) / 60) * this.PX_PER_MIN;
        const width = Math.max(10, ((e.stop - e.start) / 60) * this.PX_PER_MIN);

        const left = Math.max(rawLeft, lastRight + this.CARD_GAP);
        lastRight = left + width;

        const isCurrent = e.start <= this._now && this._now < e.stop;

        return `
          <div class="event ${isCurrent ? "current" : ""}"
               style="left:${left}px;width:${width}px">
            ${e.title}
          </div>
        `;
      }).join("");

      return `<div class="row">${blocks}</div>`;
    }).join("");

    const nowLeft = ((this._now - viewStart) / 60) * this.PX_PER_MIN;

    this.shadowRoot.innerHTML = `
      ${style}
      <ha-card>
        <div class="header">TVHeadend EPG</div>
        <div class="container">
          <div class="channels">
            ${channels.map(c => `<div class="channel">${c.number} – ${c.name}</div>`).join("")}
          </div>
          <div class="grid">
            <div class="now-line" style="left:${nowLeft}px"></div>
            ${rows}
          </div>
        </div>
      </ha-card>
    `;
  }

  getCardSize() {
    return 8;
  }
}

customElements.define("tvheadend-epg-card", TvheadendEpgCard);
