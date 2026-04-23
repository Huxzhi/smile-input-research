import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceEvent } from '../types'

type FaceCallback = (event: FaceEvent) => void

export class FaceDetector {
  private landmarker: FaceLandmarker | null = null
  private callbacks: FaceCallback[] = []
  private animFrame: number | null = null

  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    )
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  }

  start(video: HTMLVideoElement) {
    const detect = () => {
      if (!this.landmarker || video.readyState < 2) {
        this.animFrame = requestAnimationFrame(detect)
        return
      }
      const result = this.landmarker.detectForVideo(video, performance.now())
      if (result.faceBlendshapes?.[0]) {
        const shapes = result.faceBlendshapes[0].categories
        const get = (name: string) =>
          shapes.find(s => s.categoryName === name)?.score ?? 0

        const mouthSmileLeft  = get('mouthSmileLeft')
        const mouthSmileRight = get('mouthSmileRight')
        const mouthSmile = (mouthSmileLeft + mouthSmileRight) / 2

        // eyeSquintLeft/Right = lower eyelid rises during genuine (Duchenne) smiles
        // cheekSquintLeft/Right is a fallback — often 0 in MediaPipe
        const eyeSquintLeft   = get('eyeSquintLeft')
        const eyeSquintRight  = get('eyeSquintRight')
        const cheekSquintAvg  = (get('cheekSquintLeft') + get('cheekSquintRight')) / 2
        const duchenne = Math.max((eyeSquintLeft + eyeSquintRight) / 2, cheekSquintAvg)

        // Weighted: mouth corners primary, Duchenne eye marker secondary
        const smileScore = mouthSmile * 0.65 + duchenne * 0.35

        const blinkLeft  = get('eyeBlinkLeft')
        const blinkRight = get('eyeBlinkRight')

        const event: FaceEvent = {
          smileScore,
          mouthSmile,
          mouthSmileLeft,
          mouthSmileRight,
          cheekSquint: duchenne,
          eyeSquintLeft,
          eyeSquintRight,
          blinkLeft,
          blinkRight,
          ts: Date.now(),
          landmarks: result.faceLandmarks?.[0],
        }
        for (const cb of this.callbacks) cb(event)
      }
      this.animFrame = requestAnimationFrame(detect)
    }
    this.animFrame = requestAnimationFrame(detect)
  }

  stop() {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame)
    this.animFrame = null
  }

  onFace(cb: FaceCallback) {
    this.callbacks.push(cb)
    return () => { this.callbacks = this.callbacks.filter(c => c !== cb) }
  }
}
