class TvheadendEpgCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._hass = null;
    this._epg = [];
    this._entryId = null;
    this._loading = false;
    this._error = null;

    this.PX_PER_MIN = 4;
    this.CHANNEL_COL_WIDTH = 150;
    this.ROW_HEIGHT = 72;

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

  setConfig(config) {
    this.config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._entryId && hass) this._resolveEntryId();
    this._render();
  }

  connectedCallback() {
    if (this._entryId) this._fetchEpg();
  }

  async _resolveEntryId() {
    try {
      const entries = await this._hass.connection.sendMessagePromise({
        type: "config_entries/get",
        domain: "tvheadend_epg",
      });
      if (!entries?.length) throw new Error();
      this._entryId = entries[0].entry_id;
      await this._fetchEpg();
    } catch {
      this._error = "TVHeadend EPG integráció nem található";
      this._render();
    }
  }

  async _fetchEpg() {
    if (!this._hass || !this._entryId) return;
    this._loading = true;
    this._render();

    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "tvheadend_epg/fetch",
        entry_id: this._entryId,
      });
      this._epg = Array.isArray(result.epg) ? result.epg : [];
    } catch {
      this._error = "EPG betöltési hiba";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _render() {
    if (!this.shadowRoot) return;

    const style = `
      <style>
        ha-card {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .header {
          padding: 12px 16px;
          font-size: 18px;
          font-weight: 600;
          border-bottom: 1px solid var(--divider-color);
        }

        .timebar {
          position: sticky;
          top: 0;
          z-index: 3;
          background: var(--card-background-color);
          border-bottom: 1px solid var(--divider-color);
          height: 32px;
          display: flex;
          margin-left: ${this.CHANNEL_COL_WIDTH}px;
        }

        .timecell {
          font-size: 12px;
          padding-left: 6px;
          border-left: 1px solid var(--divider-color);
          line-height: 32px;
          white-space: nowrap;
          width: ${60 * this.PX_PER_MIN}px;
        }

        .container {
          flex: 1;
          display: flex;
          overflow: auto;
        }

        .channels {
          position: sticky;
          left: 0;
          z-index: 2;
          background: var(--card-background-color);
          min-width: ${this.CHANNEL_COL_WIDTH}px;
          border-right: 1px solid var(--divider-color);
        }

        .channel,
        .row {
          box-sizing: border-box;
          height: ${this.ROW_HEIGHT}px;
          border-bottom: 1px solid var(--divider-color);
        }

        .channel {
          display: flex;
          align-items: center;
          padding: 0 8px;
          font-weight: 600;
        }

        .row {
          position: relative;
          padding-bottom: 4px;
        }

        .grid {
          position: relative;
          flex: 1;
        }

        .event {
          position: absolute;
          top: 8px;
          height: ${this.ROW_HEIGHT - 16}px;

          background: var(--primary-color);
          color: white;

          padding: 6px 8px;
          border-radius: 10px;

          font-size: 12px;
          line-height: 1.2;

          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;

          margin-left: 4px;
          margin-right: 4px;

          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
        }

        .event.current {
          background: var(--accent-color);
          box-shadow:
            0 0 0 2px rgba(255, 255, 255, 0.35),
            0 2px 6px rgba(0, 0, 0, 0.45);
        }

        .now-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--error-color);
          z-index: 5;
          pointer-events: none;
        }
      </style>
    `;

    if (this._loading || this._error || !this._epg.length) {
      this.shadowRoot.innerHTML = `
        ${style}
        <ha-card>
          <div class="header">TVHeadend EPG</div>
        </ha-card>
      `;
      return;
    }

    const byChannel = {};
    for (const e of this._epg) {
      byChannel[e.channelUuid] ??= {
        number: Number(e.channelNumber),
        name: e.channelName,
        events: [],
      };
      byChannel[e.channelUuid].events.push(e);
    }

    const channels = Object.values(byChannel).sort((a, b) => a.number - b.number);

    const viewStart = this._now - this.WINDOW_BEFORE;
    const viewEnd = this._now + this.WINDOW_AFTER;

    const totalMinutes = (viewEnd - viewStart) / 60;
    const gridWidth = totalMinutes * this.PX_PER_MIN;

    const nowLeft =
      ((this._now - viewStart) / 60) * this.PX_PER_MIN;

    const timebar = [];
    for (let t = viewStart; t <= viewEnd; t += 3600) {
      timebar.push(
        `<div class="timecell">${new Date(t * 1000).getHours()}:00</div>`
      );
    }

    const rows = channels.map(c => {
      const events = c.events.map(e => {
        if (e.stop < viewStart || e.start > viewEnd) return "";

        const width = ((e.stop - e.start) / 60) * this.PX_PER_MIN;
        const left = ((e.start - viewStart) / 60) * this.PX_PER_MIN;

        const isCurrent = e.start <= this._now && this._now < e.stop;

        return `
          <div class="event ${isCurrent ? "current" : ""}"
               style="left:${left}px;width:${width}px">
            ${e.title}
          </div>
        `;
      }).join("");

      return `<div class="row" style="width:${gridWidth}px">${events}</div>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      ${style}
      <ha-card>
        <div class="header">TVHeadend EPG</div>
        <div class="timebar">${timebar.join("")}</div>
        <div class="container">
          <div class="channels">
            ${channels.map(c =>
              `<div class="channel">${c.number} – ${c.name}</div>`
            ).join("")}
          </div>
          <div class="grid" style="width:${gridWidth}px">
            <div class="now-line" style="left:${nowLeft}px"></div>
            ${rows}
          </div>
        </div>
      </ha-card>
    `;

    requestAnimationFrame(() => {
      const container = this.shadowRoot.querySelector(".container");
      if (container) {
        container.scrollLeft = nowLeft - container.clientWidth / 3;
      }
    });
  }

  getCardSize() {
    return 8;
  }
}

customElements.define("tvheadend-epg-card", TvheadendEpgCard);
