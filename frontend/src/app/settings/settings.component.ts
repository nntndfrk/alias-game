import { Component, signal, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService, Theme } from '../core/services/theme.service';

@Component({
  selector: 'alias-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnDestroy {
  private themeService = inject(ThemeService);
  
  currentTheme = this.themeService.currentTheme;
  themeOptions: { value: Theme; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }
  ];
  videoStream = signal<MediaStream | null>(null);
  isTestingCamera = signal(false);
  cameraError = signal<string | null>(null);
  
  // Microphone test properties
  audioStream = signal<MediaStream | null>(null);
  isRecording = signal(false);
  audioRecorded = signal(false);
  recordingTimeLeft = signal(10);
  microphoneError = signal<string | null>(null);
  audioBlob = signal<Blob | null>(null);
  audioUrl = signal<string | null>(null);
  
  private mediaRecorder: MediaRecorder | null = null;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private audioChunks: Blob[] = [];
  
  async testWebcam() {
    this.isTestingCamera.set(true);
    this.cameraError.set(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
      
      this.videoStream.set(stream);
      
      // Set the stream to video element after view updates
      setTimeout(() => {
        const videoElement = document.getElementById('webcam-preview') as HTMLVideoElement;
        if (videoElement && stream) {
          videoElement.srcObject = stream;
        }
      });
    } catch (error) {
      console.error('Error accessing webcam:', error);
      this.cameraError.set('Unable to access webcam. Please check your permissions.');
      this.isTestingCamera.set(false);
    }
  }
  
  stopWebcam() {
    const stream = this.videoStream();
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      this.videoStream.set(null);
    }
    this.isTestingCamera.set(false);
  }
  
  async startRecording() {
    this.microphoneError.set(null);
    this.audioChunks = [];
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      
      this.audioStream.set(stream);
      this.isRecording.set(true);
      this.audioRecorded.set(false);
      this.recordingTimeLeft.set(10);
      
      // Create media recorder
      this.mediaRecorder = new MediaRecorder(stream);
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioBlob.set(audioBlob);
        const audioUrl = URL.createObjectURL(audioBlob);
        this.audioUrl.set(audioUrl);
        this.audioRecorded.set(true);
      };
      
      this.mediaRecorder.start();
      
      // Start countdown timer
      let timeLeft = 10;
      this.recordingTimer = setInterval(() => {
        timeLeft--;
        this.recordingTimeLeft.set(timeLeft);
        
        if (timeLeft <= 0) {
          this.stopRecording();
        }
      }, 1000);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.microphoneError.set('Unable to access microphone. Please check your permissions.');
      this.isRecording.set(false);
    }
  }
  
  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    
    const stream = this.audioStream();
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      this.audioStream.set(null);
    }
    
    this.isRecording.set(false);
  }
  
  playAudio() {
    const audioElement = document.getElementById('audio-playback') as HTMLAudioElement;
    if (audioElement) {
      audioElement.play();
    }
  }
  
  deleteRecording() {
    const url = this.audioUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.audioUrl.set(null);
    this.audioBlob.set(null);
    this.audioRecorded.set(false);
    this.audioChunks = [];
  }
  
  onThemeChange(theme: Theme) {
    this.themeService.setTheme(theme);
  }
  
  ngOnDestroy() {
    this.stopWebcam();
    this.stopRecording();
    this.deleteRecording();
  }
}
