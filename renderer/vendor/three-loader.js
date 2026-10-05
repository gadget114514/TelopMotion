// Publishes the vendored three build as window.SA.THREE. This file is loaded
// with <script type="module" src="vendor/three-loader.js">: module scripts are
// deferred, so the classic studio scripts may run first. SA.three3d reads
// SA.THREE lazily at render time, so the order never matters.
import * as THREE from './three.module.js';

window.SA = window.SA || {};
window.SA.THREE = THREE;
