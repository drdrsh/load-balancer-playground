"use strict";
Array.prototype.random = function () {
  return this[Math.floor(Math.random() * this.length)];
};


function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

class FakeRequest {
  constructor(num_of_ticks) {
    this.size_in_ticks = num_of_ticks;
    this.ticks_waiting = 0;
    this.ticks_remaining = num_of_ticks
    this.complete = false;
    this.has_error = false;
    this.expired = false;
  }

  wait() {
    if(this.complete) {
        return;
    }
    this.ticks_waiting += 1;
    if(this.ticks_waiting >= this.size_in_ticks * 5) {
        this.complete = true;
        this.expired = true;
    }
  }

  advance() {
    if(this.ticks_remaining === 0) {
        this.complete = true;
        return;
    }
    this.ticks_remaining -= 1;
    if(this.ticks_remaining === 0) {
        this.complete = true;
    }
  }

  fail() {
    this.ticks_remaining = 0;
    this.has_error = true;
  }
}


class Server {
  constructor(idx, tick_multiplier) {
    this.id = idx;
    this.state = "up";
    this.request_queue = [];
    this.old_requests = [];
    this.tick_multiplier = tick_multiplier;
    this.current_request = null;

    this.requests_processed = 0;
    this.requests_failed = 0;
    this.total_waiting_time = 0;
    this.expired_requests = 0;

    const template = document.getElementById("server_template");
    this.containerEl = template.content.cloneNode(true);

    this.containerEl.querySelectorAll("h2")[0].innerText = `Server ${this.id}`;
    this.capacityEl = this.containerEl.querySelectorAll("input")[0];
    this.capacityEl.setAttribute("value", this.tick_multiplier);
    this.capacityEl.addEventListener("change", (event) => {
        this.tick_multiplier = this.capacityEl.value;
        this.render();
    });
    console.log(document.getElementById("servers").appendChild(this.containerEl));


  }

  take_down() {
    this.state = "down";
  }

  bring_up() {
    this.state = "up";
  }

  add_request(request) {
    this.request_queue.push(request);
  }

  render() {
  }

  tick() {
    for(let i=0; i<this.tick_multiplier; i++) {
        if (this.request_queue.length === 0) {
            // Queue is already empty
            break;
        }

        if (this.current_request === null) {
            this.current_request = this.request_queue.pop();
            if (this.current_request === null) {
                // We have just finished the queue
                break;
            }
        }

        if(this.state === "up") {
            this.current_request.advance();
        } else {
            this.current_request.fail();
            this.requests_failed += 1;
            this.current_request = null;
        }
        if(this.current_request.complete) {
            this.current_request = null;
            this.requests_processed += 1;
        }
    }
    this.total_waiting_time += 1 * this.request_queue.length;
    let before = this.request_queue.length;
    this.request_queue.map(req => req.wait());
    this.request_queue = this.request_queue.filter(req => !req.expired);
    let after = this.request_queue.length;
    this.expired_requests += before - after;
    this.render();
}

}

function getAlgorithmClass() {
    let selectedAlgorithm = document.getElementById("algorithm").value
    if(selectedAlgorithm == "custom") {
        eval(document.getElementById("custom-code").value);
        return window.AlgorithmCustom;
    }
    return window.ALGORITHM_LOOKUP[selectedAlgorithm];
}

function createSimulation() {
    let serverCount = parseInt(document.getElementById("server_count").value, 10);

    let lb = new LoadBalancer(getAlgorithmClass());

    for(let i=0; i<serverCount; i++) {
        lb.add_server(new Server(i, 20));
    }

    let request_duration_rng = mulberry32(111);

    let maxCostEl = document.getElementById("max_cost")
    let maxCost = maxCostEl.value;
    maxCostEl.addEventListener("change", (event) => { maxCost = maxCostEl.value });

    const simCallback = () => {
        let reqPerTickRaw = parseFloat(document.getElementById("request_frequency").value, 10);

        let reqPerTick = Math.floor(reqPerTickRaw);
        let reqProbabilityPerTick = reqPerTickRaw - reqPerTick;

        for(let i=0 ;i<reqPerTick; i++ ){
            lb.route(new FakeRequest(Math.floor(request_duration_rng() * maxCost)));
        }
        if(Math.random() < reqProbabilityPerTick) {
            lb.route(new FakeRequest(Math.floor(request_duration_rng() * maxCost)));
        }

        lb.tick();
    }

    let simSpeed = 10;
    let simInterval = null;
    let simSpeedEl = document.getElementById("simulation_frequency")
    simSpeedEl.setAttribute("value", simSpeed);
    simSpeedEl.addEventListener("change", (event) => {
        simSpeed = simSpeedEl.value;
        if(simInterval != null) {
            clearInterval(simInterval);
            simInterval = setInterval(simCallback, simSpeed);
        }
    });

    document.getElementById("toggle_sim").addEventListener("click", (event) => {
        if(event.target.innerText == "Resume") {
            simInterval = setInterval(simCallback, simSpeed);
            event.target.innerText = "Pause"
        } else {
            if(simInterval !== null) {
                clearInterval(simInterval);
            }
            event.target.innerText = "Resume"
        }
    });

    document.getElementById("main_form").style.display = 'none';
    document.getElementById("simulation").style.display = 'block';
}


class LoadBalancer {
  constructor(algorithmClass) {
    this.servers = [];

    this.algorithmClass = null;
    this.algorithmHandler = null;
    this.queueChart = null;
    this.requestChart = null;
    this.expiredChart = null;
    this.waitingChart = null;
    this.algorithmClass = algorithmClass
    let algoName = this.algorithmClass.name || "AlgorithmCustom";
    const template = document.getElementById("lb_template").content.cloneNode(true);
    this.containerEl = template.querySelector("div");
    template.querySelector("h3").innerText = template.querySelector("h3").innerText.replace("{MODE}",algoName);


    document.getElementById("loadbalancers").appendChild(this.containerEl);
}

  add_server(server) {
    this.servers.push(server);
  }

  render() {
    if(this.waitingChart === null) {
        this.waitingChart = new Chart(this.containerEl.querySelector('.waiting').firstChild, {
            type: 'bar', options: { indexAxis: 'y' },
            data: {
                labels: this.servers.map((_, idx) => `#${idx}`),
                datasets: [{
                    label: 'Waiting Time',
                    data: this.servers.map((value, idx) => value.total_waiting_time),
                    backgroundColor: "#aaaa00"
                }]
            },
        });
    }
    this.waitingChart.data.datasets[0].data = this.servers.map((value, idx) => value.total_waiting_time);
    this.waitingChart.update();

    if(this.queueChart === null) {
        this.queueChart = new Chart(this.containerEl.querySelector('.queue').firstChild, {
            type: 'bar', options: { indexAxis: 'y' },
            data: {
                labels: this.servers.map((value, idx) => `#${idx}`),
                datasets: [{
                    label: 'Queue Size',
                    data: this.servers.map((value, idx) => value.request_queue.length),
                    backgroundColor: "#aaaa00"
                }]
            },
        });
    }
    this.queueChart.data.datasets[0].data = this.servers.map((value, idx) => value.request_queue.length);
    this.queueChart.update();

    if(this.requestChart === null) {
        this.requestChart = new Chart(this.containerEl.querySelector('.rps').firstChild, {
            type: 'bar', options: { indexAxis: 'y' },
            data: {
                labels: this.servers.map((value, idx) => `#${idx}`),
                datasets: [{
                    label: 'Processed Requests',
                    data: this.servers.map((value, idx) => value.requests_processed),
                    backgroundColor: "#00aa00"
                }]
            },
        });
    }
    this.requestChart.data.datasets[0].data = this.servers.map((value, idx) => value.requests_processed);
    this.requestChart.update();

    if(this.expiredChart === null) {
        this.expiredChart = new Chart(this.containerEl.querySelector('.expired').firstChild, {
            type: 'bar', options: { indexAxis: 'y' },
            data: {
                labels: this.servers.map((value, idx) => `#${idx}`),
                datasets: [{
                    label: 'Expired Requests',
                    data: this.servers.map((value, idx) => value.expired_requests),
                    backgroundColor: "#aa0000"
                }]
            },
        });
    }
    this.expiredChart.data.datasets[0].data = this.servers.map((value, idx) => value.expired_requests);
    this.expiredChart.update();
}


  route(req) {
    if(this.algorithmHandler == null) {
        this.algorithmHandler = new this.algorithmClass(this.servers);
    }
    this.algorithmHandler.route(req);
  }

  humanFileSize(bytes, dp=1) {
    const thresh = 1000;

    if (Math.abs(bytes) < thresh) {
      return bytes;
    }

    const units = ['k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
    let u = -1;
    const r = 10**dp;

    do {
      bytes /= thresh;
      ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


    return bytes.toFixed(dp) + ' ' + units[u];
  }

  tick() {
    this.servers.map((s) => s.tick());
    let reqCount = this.servers.reduce((a,b) => a + b.requests_processed, 0);
    let expiredCount = this.servers.reduce((a,b) => a + b.expired_requests, 0);
    let pctFailed = Math.floor((expiredCount / (reqCount + expiredCount)) * 100);
    let totalWait = this.servers.reduce((a,b) => a + b.total_waiting_time, 0);

    this.render();
    document.getElementById('lb-stats').innerHTML = `
    Total processed: ${this.humanFileSize(reqCount)}<br>
    Total wait (ticks): ${this.humanFileSize(totalWait)}<br>
    Failure Rate: ${pctFailed}%<br>
    `

  }
}


window.addEventListener('DOMContentLoaded', (event) => {
    document.getElementById("algorithm").addEventListener("change", (event) => {
        if(event.target.value != "custom") {
            document.getElementById("custom-code").value = window.ALGORITHM_LOOKUP[event.target.value].toString();
            document.getElementById("custom-code").setAttribute("disabled", "disabled");
        } else {
            document.getElementById("custom-code").value = DEFAULT_CUSTOM_ALGO;
            document.getElementById("custom-code").removeAttribute("disabled");
        }
    });
    document.getElementById("algorithm").dispatchEvent(new Event('change'));
});
