import { Component, signal, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent } from '@shared/ui';

interface MediaDevice {
  deviceId: string;
  label: string;
}

@Component({
  selector: 'alias-webcam-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, CardComponent, CardHeaderComponent, CardTitleComponent, CardContentComponent],
  template: `
    <alias-card>
      <alias-card-header>
        <alias-card-title>Camera Setup</alias-card-title>
      </alias-card-header>
      <alias-card-content>
        <div class="space-y-4">
          @if (!isCameraActive()) {
            <div class="text-center py-8">
              <svg class="w-16 h-16 mx-auto mb-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p class="text-muted-foreground mb-4">Test your camera before the game starts</p>
              <alias-button (click)="startCamera()" [disabled]="isLoading()">
                @if (isLoading()) {
                  Connecting...
                } @else {
                  Test Camera
                }
              </alias-button>
            </div>
          } @else {
            <div class="space-y-4">
              <!-- Video Preview -->
              <div class="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video 
                  #videoElement
                  autoplay 
                  muted 
                  playsinline
                  class="w-full h-full object-cover"
                  [class.mirror]="true"
                ></video>
                
                @if (isLoading()) {
                  <div class="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div class="text-white">Loading camera...</div>
                  </div>
                }
              </div>
              
              <!-- Camera Selection -->
              @if (availableCameras().length > 1) {
                <div>
                  <label for="camera-select" class="block text-sm font-medium mb-2">Select Camera</label>
                  <select
                    id="camera-select" 
                    class="w-full px-3 py-2 pr-10 border rounded-lg bg-background appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20width%3d%2212%22%20height%3d%2212%22%20viewBox%3d%220%200%2012%2012%22%3e%3cpath%20fill%3d%22%23666%22%20d%3d%22M10.293%203.293L6%207.586%201.707%203.293A1%201%200%2000.293%204.707l5%205a1%201%200%20001.414%200l5-5a1%201%200%2010-1.414-1.414z%22%2f%3e%3c%2fsvg%3e')] bg-[length:12px] bg-[right_0.7rem_center] bg-no-repeat"
                    [(ngModel)]="selectedCameraIdValue"
                    (ngModelChange)="onCameraChange($event)"
                  >
                    @for (camera of availableCameras(); track camera.deviceId; let i = $index) {
                      <option [value]="camera.deviceId">{{ camera.label || 'Camera ' + (i + 1) }}</option>
                    }
                  </select>
                </div>
              }
              
              <!-- Microphone Selection -->
              @if (availableMicrophones().length > 0) {
                <div>
                  <label for="microphone-select" class="block text-sm font-medium mb-2">Select Microphone</label>
                  <select
                    id="microphone-select" 
                    class="w-full px-3 py-2 pr-10 border rounded-lg bg-background appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20width%3d%2212%22%20height%3d%2212%22%20viewBox%3d%220%200%2012%2012%22%3e%3cpath%20fill%3d%22%23666%22%20d%3d%22M10.293%203.293L6%207.586%201.707%203.293A1%201%200%2000.293%204.707l5%205a1%201%200%20001.414%200l5-5a1%201%200%2010-1.414-1.414z%22%2f%3e%3c%2fsvg%3e')] bg-[length:12px] bg-[right_0.7rem_center] bg-no-repeat"
                    [(ngModel)]="selectedMicrophoneIdValue"
                    (ngModelChange)="onMicrophoneChange($event)"
                  >
                    @for (mic of availableMicrophones(); track mic.deviceId; let i = $index) {
                      <option [value]="mic.deviceId">{{ mic.label || 'Microphone ' + (i + 1) }}</option>
                    }
                  </select>
                </div>
              }
              
              <!-- Audio Level Indicator -->
              @if (selectedMicrophoneId()) {
                <div>
                  <label for="mic-level" class="block text-sm font-medium mb-2">Microphone Level</label>
                  <div id="mic-level" class="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      class="h-full bg-green-500 transition-all duration-100"
                      [style.width.%]="audioLevel()"
                    ></div>
                  </div>
                </div>
              }
              
              <!-- Status Messages -->
              @if (errorMessage()) {
                <div class="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  {{ errorMessage() }}
                </div>
              }
              
              @if (successMessage()) {
                <div class="p-3 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg text-sm">
                  <svg class="inline-block w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  {{ successMessage() }}
                </div>
              }
              
              <!-- Controls -->
              <div class="flex gap-3">
                <alias-button 
                  variant="destructive" 
                  (click)="stopCamera()"
                  class="flex-1"
                >
                  Stop Camera
                </alias-button>
                <alias-button 
                  variant="default"
                  [disabled]="!isReady()"
                  class="flex-1"
                >
                  @if (isReady()) {
                    Ready to Play
                  } @else {
                    Testing...
                  }
                </alias-button>
              </div>
            </div>
          }
        </div>
      </alias-card-content>
    </alias-card>
  `,
  styles: [`
    video.mirror {
      transform: scaleX(-1);
    }
  `]
})
export class WebcamPreviewComponent implements OnDestroy {
  videoStream = signal<MediaStream | null>(null);
  isCameraActive = signal(false);
  isLoading = signal(false);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  
  availableCameras = signal<MediaDevice[]>([]);
  availableMicrophones = signal<MediaDevice[]>([]);
  selectedCameraId = signal<string>('');
  selectedMicrophoneId = signal<string>('');
  
  // Values for ngModel binding
  selectedCameraIdValue = '';
  selectedMicrophoneIdValue = '';
  
  audioLevel = signal(0);
  private audioContext: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private audioAnimationFrame: number | null = null;
  
  isReady = computed(() => 
    this.isCameraActive() && 
    !this.isLoading() && 
    !this.errorMessage()
  );
  
  async startCamera() {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    
    // Clean up any existing streams first
    await this.cleanupResources();
    
    try {
      // First, get the list of devices
      await this.getDeviceList();
      
      // Sync ngModel values with signals
      this.selectedCameraIdValue = this.selectedCameraId();
      this.selectedMicrophoneIdValue = this.selectedMicrophoneId();
      
      // Validate device IDs
      const validatedCameraId = await this.validateDeviceId(this.selectedCameraId(), 'videoinput');
      const validatedMicId = await this.validateDeviceId(this.selectedMicrophoneId(), 'audioinput');
      
      console.log('Starting camera with devices:', {
        selectedCamera: this.selectedCameraId(),
        validatedCamera: validatedCameraId,
        selectedMic: this.selectedMicrophoneId(),
        validatedMic: validatedMicId
      });
      
      // Request camera and microphone permissions
      const constraints: MediaStreamConstraints = {
        video: validatedCameraId 
          ? { deviceId: { exact: validatedCameraId } }
          : true,
        audio: validatedMicId
          ? { deviceId: { exact: validatedMicId } }
          : true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoStream.set(stream);
      this.isCameraActive.set(true);
      
      // Set video source
      setTimeout(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video && stream) {
          video.srcObject = stream;
        }
      });
      
      // Setup audio level monitoring
      await this.setupAudioMonitoring(stream);
      
      this.successMessage.set('Camera and microphone connected successfully!');
      this.isLoading.set(false);
      
      // Refresh device list with labels now that we have permissions
      await this.getDeviceList();
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      this.handleMediaError(error);
      this.isLoading.set(false);
    }
  }
  
  async getDeviceList() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Store current selections before updating device lists
      const currentCameraId = this.selectedCameraId();
      const currentMicId = this.selectedMicrophoneId();
      
      const cameras = devices
        .filter(device => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`
        }));
      
      const microphones = devices
        .filter(device => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`
        }));
      
      this.availableCameras.set(cameras);
      this.availableMicrophones.set(microphones);
      
      console.log('Available microphones:', microphones.map(m => ({ id: m.deviceId.slice(0, 8), label: m.label })));
      
      // Preserve current selections if they still exist in the new device list
      const cameraStillExists = cameras.some(cam => cam.deviceId === currentCameraId);
      const micStillExists = microphones.some(mic => mic.deviceId === currentMicId);
      
      // Only set defaults if no selection exists or if the selected device is no longer available
      if ((!currentCameraId || !cameraStillExists) && cameras.length > 0) {
        this.selectedCameraId.set(cameras[0].deviceId);
        this.selectedCameraIdValue = cameras[0].deviceId;
      } else if (currentCameraId) {
        this.selectedCameraIdValue = currentCameraId;
      }
      
      if ((!currentMicId || !micStillExists) && microphones.length > 0) {
        this.selectedMicrophoneId.set(microphones[0].deviceId);
        this.selectedMicrophoneIdValue = microphones[0].deviceId;
      } else if (currentMicId) {
        this.selectedMicrophoneIdValue = currentMicId;
      }
    } catch (error) {
      console.error('Error enumerating devices:', error);
    }
  }
  
  async onCameraChange(newCameraId: string) {
    console.log('Changing camera to:', newCameraId);
    this.selectedCameraId.set(newCameraId);
    this.selectedCameraIdValue = newCameraId;
    
    // If camera is active, restart with new camera
    if (this.isCameraActive()) {
      await this.stopCamera();
      await this.startCamera();
      
      // Verify the correct camera is being used
      const stream = this.videoStream();
      if (stream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          console.log('Active camera device ID:', settings.deviceId);
          console.log('Selected camera device ID:', this.selectedCameraId());
        }
      }
    }
  }
  
  async onMicrophoneChange(newMicId: string) {
    console.log('Changing microphone to:', newMicId);
    this.selectedMicrophoneId.set(newMicId);
    this.selectedMicrophoneIdValue = newMicId;
    
    // If camera is active, restart with new microphone
    if (this.isCameraActive()) {
      await this.stopCamera();
      await this.startCamera();
      
      // Verify the correct microphone is being used
      const stream = this.videoStream();
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          const settings = audioTrack.getSettings();
          console.log('Active microphone device ID:', settings.deviceId);
          console.log('Selected microphone device ID:', this.selectedMicrophoneId());
        }
      }
    }
  }
  
  async setupAudioMonitoring(stream: MediaStream) {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    
    console.log('Setting up audio monitoring for track:', audioTracks[0].label, audioTracks[0].getSettings().deviceId);
    
    // Clean up any existing audio context first and wait for it
    await this.cleanupAudioContext();
    
    // Small delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.audioContext = new AudioContext();
    this.audioAnalyser = this.audioContext.createAnalyser();
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.audioAnalyser);
    
    this.audioAnalyser.fftSize = 256;
    const bufferLength = this.audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const updateAudioLevel = () => {
      if (!this.audioAnalyser) return;
      
      this.audioAnalyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
      const normalizedLevel = Math.min(100, (average / 128) * 100);
      this.audioLevel.set(normalizedLevel);
      
      this.audioAnimationFrame = requestAnimationFrame(updateAudioLevel);
    };
    
    updateAudioLevel();
  }
  
  async stopCamera() {
    await this.cleanupResources();
    this.isCameraActive.set(false);
    this.audioLevel.set(0);
    this.successMessage.set('');
  }
  
  private async cleanupResources() {
    // Clean up video stream
    const stream = this.videoStream();
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      this.videoStream.set(null);
    }
    
    // Clean up audio monitoring
    await this.cleanupAudioContext();
  }
  
  private async cleanupAudioContext() {
    if (this.audioAnimationFrame) {
      cancelAnimationFrame(this.audioAnimationFrame);
      this.audioAnimationFrame = null;
    }
    
    if (this.audioContext) {
      try {
        // Close audio context and wait for it
        await this.audioContext.close();
        console.debug('Audio context closed successfully');
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
      this.audioContext = null;
      this.audioAnalyser = null;
    }
  }
  
  private async validateDeviceId(deviceId: string, kind: MediaDeviceKind): Promise<string | null> {
    if (!deviceId) return null;
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const device = devices.find(d => d.deviceId === deviceId && d.kind === kind);
      return device ? device.deviceId : null;
    } catch (error) {
      console.error('Error validating device ID:', error);
      return null;
    }
  }
  
  handleMediaError(error: unknown) {
    const err = error as DOMException;
    if (err.name === 'NotAllowedError') {
      this.errorMessage.set('Camera access denied. Please check your browser permissions.');
    } else if (err.name === 'NotFoundError') {
      this.errorMessage.set('No camera found. Please connect a camera and try again.');
    } else if (err.name === 'NotReadableError') {
      this.errorMessage.set('Camera is already in use by another application.');
    } else {
      this.errorMessage.set('Unable to access camera. Please check your settings.');
    }
  }
  
  ngOnDestroy() {
    // Synchronously clean up what we can
    this.isCameraActive.set(false);
    this.audioLevel.set(0);
    
    // Clean up resources asynchronously
    this.cleanupResources().catch(error => {
      console.error('Error during cleanup:', error);
    });
  }
}