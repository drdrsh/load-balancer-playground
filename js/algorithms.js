
class AlgorithmRoundRobin {
  constructor(servers) {
      this.servers = servers;
      this.cursor = 0;
  }

  route(req) {
      this.cursor += 1;
      this.servers[this.cursor % this.servers.length].add_request(req);
  }
}


class AlgorithmPureLoR {
  constructor(servers) {
      this.servers = servers;
  }

  route(req) {
    let servers = [...this.servers];
    servers.sort((a, b) => a.request_queue.length - b.request_queue.length);
    servers[0].add_request(req);
  }
}

class AlgorithmRandomLoR {
  constructor(servers) {
      this.servers = servers;
  }

  route(req) {
    let servers = [...this.servers];
    servers.sort(() => Math.random() - 0.5);
    servers.sort((a, b) => a.request_queue.length - b.request_queue.length);
    servers[0].add_request(req);
  }
}

class AlgorithmRandom {
  constructor(servers) {
      this.servers = servers;
  }

  route(req) {
    this.servers.random().add_request(req);
  }
}


const DEFAULT_CUSTOM_ALGO = `
window.AlgorithmCustom = class {
  constructor(servers) {
      this.servers = servers;
      this.cursor = 0;
  }

  route(req) {
      this.cursor += 2;
      this.servers[this.cursor % this.servers.length].add_request(req);
  }
}`;
eval(DEFAULT_CUSTOM_ALGO);

window.ALGORITHM_LOOKUP = {
  "rr": AlgorithmRoundRobin,
  "pure_lor": AlgorithmPureLoR,
  "lor": AlgorithmRandomLoR,
  "random": AlgorithmRandom,
  "custom": window.AlgorithmCustom
}

