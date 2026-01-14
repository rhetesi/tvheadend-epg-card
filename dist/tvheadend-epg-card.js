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
    this.CHANNEL_COL_WIDTH = 200;
    this.ROW_HEIGHT = 100;
    this.CARD_HEIGHT = 80;
    this.CARD_MARGIN = 2;

    this.WINDOW_BEFORE = 3 * 3600; // 3 óra vissza
    this.WINDOW_AFTER = 6 * 3600;  // 6 óra előre

    this._now = Math.floor(Date.now() / 1000);
    setInterval(() => {
      this._now = Math.floor(Date.now() / 1000);
      this._render();
    }, 60000);
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
        time_range: {
          start: this._now - this.WINDOW_BEFORE,
          end: this._now + this.WINDOW_AFTER
        }
      });
      this._epg = Array.isArray(result.epg) ? result.epg : [];
    } catch {
      this._error = "EPG betöltési hiba";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  }

  _formatDuration(minutes) {
    return `${minutes} perc`;
  }

  _render() {
    if (!this.shadowRoot) return;

    const style = `
      <style>
        :host {
          display: block;
        }
        
        ha-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--card-background-color, white);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .header {
          padding: 16px;
          background: var(--primary-color, #2196F3);
          color: white;
          border-bottom: 1px solid var(--divider-color);
        }

        .header h1 {
          margin: 0 0 4px 0;
          font-size: 20px;
          font-weight: 600;
        }

        .header .time-range {
          font-size: 14px;
          opacity: 0.9;
        }

        .container {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: auto;
          background: #f5f5f5;
        }

        .channels-container {
          display: flex;
          flex-direction: column;
          min-width: 100%;
          padding: 8px;
        }

        .channel-row {
          display: flex;
          margin-bottom: 8px;
          min-height: ${this.ROW_HEIGHT}px;
          background: white;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
          overflow: hidden;
        }

        .channel-info {
          width: ${this.CHANNEL_COL_WIDTH}px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          border-right: 1px solid #e0e0e0;
          background: #fafafa;
        }

        .channel-name {
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 4px;
          color: var(--primary-text-color);
        }

        .channel-number {
          font-size: 12px;
          color: var(--secondary-text-color);
        }

        .programs-container {
          flex: 1;
          position: relative;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 8px;
        }

        .programs-track {
          position: relative;
          height: 100%;
          min-width: max-content;
          display: flex;
          align-items: center;
        }

        .program-card {
          position: absolute;
          height: ${this.CARD_HEIGHT}px;
          background: linear-gradient(135deg, var(--primary-color, #2196F3) 0%, #64B5F6 100%);
          color: white;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid rgba(0,0,0,0.1);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .program-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }

        .program-card.current {
          background: linear-gradient(135deg, var(--accent-color, #FF9800) 0%, #FFB74D 100%);
          border-left: 4px solid var(--error-color, #F44336);
        }

        .program-title {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 4px;
          line-height: 1.2;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .program-time {
          font-size: 12px;
          opacity: 0.9;
          margin-bottom: 2px;
        }

        .program-duration {
          font-size: 11px;
          opacity: 0.8;
        }

        .loading, .error {
          padding: 40px;
          text-align: center;
          color: var(--secondary-text-color);
        }

        .error {
          color: var(--error-color);
        }

        /* Jelenlegi idő jelző */
        .now-indicator {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--error-color, #F44336);
          z-index: 1;
          pointer-events: none;
        }

        .now-indicator::after {
          content: 'Most';
          position: absolute;
          top: 8px;
          left: 4px;
          background: var(--error-color, #F44336);
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 600;
        }

        /* Óra jelölések */
        .time-marker {
          position: absolute;
          top: 0;
          height: 100%;
          border-left: 1px dashed rgba(0,0,0,0.1);
          padding-left: 4px;
          font-size: 12px;
          color: var(--secondary-text-color);
          pointer-events: none;
          z-index: 0;
        }

        /* Görgetés támogatás */
        .programs-container::-webkit-scrollbar {
          height: 8px;
        }

        .programs-container::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }

        .programs-container::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 4px;
        }

        .programs-container::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
      </style>
    `;

    if (this._loading) {
      this.shadowRoot.innerHTML = `${style}
        <ha-card>
          <div class="header">
            <h1>Összes csatorna</h1>
            <div class="time-range">Betöltés...</div>
          </div>
          <div class="loading">Műsorújság betöltése...</div>
        </ha-card>`;
      return;
    }

    if (this._error) {
      this.shadowRoot.innerHTML = `${style}
        <ha-card>
          <div class="header">
            <h1>Összes csatorna</h1>
            <div class="time-range">Hiba</div>
          </div>
          <div class="error">${this._error}</div>
        </ha-card>`;
      return;
    }

    if (!this._epg.length) {
      this.shadowRoot.innerHTML = `${style}
        <ha-card>
          <div class="header">
            <h1>Összes csatorna</h1>
            <div class="time-range">Nincs műsoradat</div>
          </div>
          <div class="loading">Nincs elérhető műsor ebben az időszakban</div>
        </ha-card>`;
      return;
    }

    // Csatornák csoportosítása
    const channels = {};
    this._epg.forEach(event => {
      if (!channels[event.channelUuid]) {
        channels[event.channelUuid] = {
          uuid: event.channelUuid,
          number: event.channelNumber,
          name: event.channelName,
          programs: []
        };
      }
      channels[event.channelUuid].programs.push(event);
    });

    // Csatornák rendezése szám szerint
    const sortedChannels = Object.values(channels).sort((a, b) => {
      return parseInt(a.number) - parseInt(b.number);
    });

    // Időintervallum számolása
    const now = new Date();
    const startTime = new Date(now);
    startTime.setHours(17, 30, 0, 0); // Ma 17:30
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 1); // +1 óra

    const viewStart = this._now - this.WINDOW_BEFORE;
    const viewEnd = this._now + this.WINDOW_AFTER;
    const totalMinutes = (viewEnd - viewStart) / 60;
    const gridWidth = totalMinutes * this.PX_PER_MIN;

    const startDate = new Date(viewStart * 1000);
    const endDate = new Date(viewEnd * 1000);
    const timeRangeText = `${this._formatTime(viewStart)} - ${this._formatTime(viewEnd)}`;

    // Időjelölők generálása (óránként)
    const timeMarkers = [];
    for (let hour = startDate.getHours(); hour <= endDate.getHours(); hour++) {
      const hourTime = new Date(startDate);
      hourTime.setHours(hour, 0, 0, 0);
      const hourTimestamp = hourTime.getTime() / 1000;
      if (hourTimestamp >= viewStart && hourTimestamp <= viewEnd) {
        const left = ((hourTimestamp - viewStart) / 60) * this.PX_PER_MIN;
        timeMarkers.push(`
          <div class="time-marker" style="left: ${left}px">
            ${hour}:00
          </div>
        `);
      }
    }

    // Jelenlegi idő jelző
    const nowLeft = ((this._now - viewStart) / 60) * this.PX_PER_MIN;

    // Csatorna sorok generálása
    const channelRows = sortedChannels.map(channel => {
      // Programkártyák generálása ehhez a csatornához
      const programCards = channel.programs.map(program => {
        const programStart = program.start;
        const programEnd = program.stop;
        const duration = (programEnd - programStart) / 60;

        // Csak a nézetben lévő programokat jelenítjük meg
        if (programEnd < viewStart || programStart > viewEnd) return '';

        const left = ((programStart - viewStart) / 60) * this.PX_PER_MIN;
        const width = duration * this.PX_PER_MIN - this.CARD_MARGIN * 2;
        
        const isCurrent = programStart <= this._now && this._now < programEnd;
        
        // Program részleteinek kinyerése a kép alapján
        let programDetails = '';
        if (program.description) {
          // Ha van leírás, próbáljuk meg kivonni a nyelvet és műfajt
          const desc = program.description.toLowerCase();
          if (desc.includes('magyar')) programDetails += 'magyar ';
          if (desc.includes('hírműsor')) programDetails += 'hírműsor';
          else if (desc.includes('rajzfilm')) programDetails += 'rajzfilm';
          else if (desc.includes('sorozat')) programDetails += 'sorozat';
          else if (desc.includes('dokumentum')) programDetails += 'dokumentumfilm';
          else if (desc.includes('sport')) programDetails += 'sportműsor';
          else if (desc.includes('magazin')) programDetails += 'magazinműsor';
          else if (desc.includes('ismeretterjesztő')) programDetails += 'ismeretterjesztő';
          else if (desc.includes('szórakoztató')) programDetails += 'szórakoztató';
        }

        return `
          <div class="program-card ${isCurrent ? 'current' : ''}" 
               style="left: ${left + this.CARD_MARGIN}px; width: ${width}px;"
               title="${program.title} (${this._formatDuration(Math.round(duration))})">
            <div class="program-title">${program.title}</div>
            <div class="program-time">${this._formatTime(programStart)} - ${this._formatTime(programEnd)}</div>
            <div class="program-duration">${this._formatDuration(Math.round(duration))}${programDetails ? ` • ${programDetails}` : ''}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="channel-row">
          <div class="channel-info">
            <div class="channel-name">${channel.name}</div>
            <div class="channel-number">${channel.number}</div>
          </div>
          <div class="programs-container">
            <div class="programs-track" style="min-width: ${gridWidth}px;">
              ${timeMarkers.join('')}
              <div class="now-indicator" style="left: ${nowLeft}px"></div>
              ${programCards}
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.shadowRoot.innerHTML = `
      ${style}
      <ha-card>
        <div class="header">
          <h1>Összes csatorna</h1>
          <div class="time-range">${timeRangeText}</div>
        </div>
        <div class="container">
          <div class="channels-container">
            ${channelRows}
          </div>
        </div>
      </ha-card>
    `;

    // Automatikus görgetés a jelenlegi időhöz
    requestAnimationFrame(() => {
      const containers = this.shadowRoot.querySelectorAll('.programs-container');
      containers.forEach(container => {
        const scrollLeft = nowLeft - container.clientWidth / 3;
        container.scrollLeft = Math.max(0, scrollLeft);
      });
    });
  }

  getCardSize() {
    return 8;
  }
}

customElements.define("tvheadend-epg-card", TvheadendEpgCard);
