import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { ThemeService } from '../core/services/theme.service';

import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;

  beforeEach(async () => {
    const mockThemeService = {
      currentTheme: jasmine.createSpy().and.returnValue('system'),
      setTheme: jasmine.createSpy()
    };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideExperimentalZonelessChangeDetection(),
        { provide: ThemeService, useValue: mockThemeService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
