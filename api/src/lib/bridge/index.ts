import { PgBridgeRepository } from "./repository.js";
import { BridgeService } from "./bridgeService.js";
import { OrderReconciler } from "./reconciler.js";

let _repository: PgBridgeRepository | null = null;
let _service: BridgeService | null = null;
let _reconciler: OrderReconciler | null = null;
let _initPromise: Promise<void> | null = null;

function ensureInstances() {
  if (!_repository) {
    _repository = PgBridgeRepository.fromSettings();
    _service = new BridgeService(_repository);
    _reconciler = new OrderReconciler(_repository, _service);
  }
}

export async function getBridgeService(): Promise<BridgeService> {
  ensureInstances();
  if (!_initPromise) {
    _initPromise = _service!.init();
  }
  await _initPromise;
  return _service!;
}

export function getBridgeReconciler(): OrderReconciler {
  ensureInstances();
  return _reconciler!;
}
