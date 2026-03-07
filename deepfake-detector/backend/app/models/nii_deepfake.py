"""
NII Yamagishi Lab AntiDeepfake Model Wrapper

Custom model loader for nii-yamagishilab/wav2vec-large-anti-deepfake.
This model uses fairseq's Wav2Vec2 architecture with a custom classifier head.
"""
from __future__ import annotations

import torch
import torch.nn as nn
from fairseq.models.wav2vec import Wav2Vec2Model, Wav2Vec2Config
from huggingface_hub import PyTorchModelHubMixin


class SSLModel(nn.Module):
    """Self-Supervised Learning frontend using fairseq Wav2Vec2."""
    
    def __init__(self):
        super().__init__()
        # Model config used to build SSL architecture (matches pretrained weights)
        cfg = Wav2Vec2Config(
            quantize_targets=True,
            extractor_mode="layer_norm",
            layer_norm_first=True,
            final_dim=768,
            latent_temp=(2.0, 0.1, 0.999995),
            encoder_layerdrop=0.0,
            dropout_input=0.0,
            dropout_features=0.0,
            dropout=0.0,
            attention_dropout=0.0,
            conv_bias=True,
            encoder_layers=24,
            encoder_embed_dim=1024,
            encoder_ffn_embed_dim=4096,
            encoder_attention_heads=16,
            feature_grad_mult=1.0,
        )
        # Initialize SSL model (weights loaded later from pretrained checkpoint)
        self.model = Wav2Vec2Model(cfg)

    def extract_feat(self, input_data: torch.Tensor, device: torch.device) -> torch.Tensor:
        """
        Extract features from raw waveform.
        
        Args:
            input_data: Tensor of shape (B, T) - batch of waveforms
            device: Target device for computation
            
        Returns:
            Features tensor of shape (B, T', D) where D=1024
        """
        # If input has shape (B, T, 1), squeeze the last dim
        if input_data.ndim == 3:
            input_data = input_data[:, :, 0]
        
        # Extract features (no gradients needed for inference)
        with torch.no_grad():
            features = self.model(
                input_data.to(device), 
                mask=False, 
                features_only=True
            )['x']
        return features


class DeepfakeDetector(nn.Module, PyTorchModelHubMixin):
    """
    NII AntiDeepfake model: SSL frontend + FC backend for binary classification.
    
    Architecture:
    - Frontend: Wav2Vec2-Large SSL model (feature extraction)
    - Backend: AdaptiveAvgPool1d + Linear layer (classification)
    
    Output: Binary logits [fake_score, real_score]
    """
    
    def __init__(self):
        super().__init__()
        self.ssl_orig_output_dim = 1024
        self.num_classes = 2

        # Frontend: SSL model for feature extraction
        self.m_ssl = SSLModel()

        # Backend: Pooling + Classification
        self.adap_pool1d = nn.AdaptiveAvgPool1d(output_size=1)
        self.proj_fc = nn.Linear(
            in_features=self.ssl_orig_output_dim,
            out_features=self.num_classes,
        )

    def forward(self, wav: torch.Tensor, device: torch.device = None) -> torch.Tensor:
        """
        Forward pass: waveform -> binary classification logits.
        
        Args:
            wav: Tensor of shape (B, T) - normalized waveform at 16kHz
            device: Target device (optional, uses model's device if not specified)
            
        Returns:
            Logits tensor of shape (B, 2) -> [fake_score, real_score]
        """
        if device is None:
            device = next(self.parameters()).device
            
        emb = self.m_ssl.extract_feat(wav, device)  # [B, T, D]
        emb = emb.transpose(1, 2)                    # [B, D, T]
        pooled_emb = self.adap_pool1d(emb)           # [B, D, 1]
        pooled_emb = pooled_emb.squeeze(-1)          # [B, D]
        logits = self.proj_fc(pooled_emb)            # [B, 2]
        return logits


def load_nii_model(model_id: str = "nii-yamagishilab/wav2vec-large-anti-deepfake") -> DeepfakeDetector:
    """
    Load the NII AntiDeepfake model from Hugging Face.
    
    Args:
        model_id: HuggingFace model ID
        
    Returns:
        Loaded DeepfakeDetector model ready for inference
    """
    model = DeepfakeDetector.from_pretrained(model_id)
    model.eval()
    return model


def preprocess_audio(audio_np, target_sr: int = 16000) -> torch.Tensor:
    """
    Preprocess audio for NII model input.
    
    The model expects layer-normalized waveform at 16kHz.
    
    Args:
        audio_np: NumPy array of audio samples (float32, normalized to [-1, 1])
        target_sr: Target sample rate (should be 16000)
        
    Returns:
        Preprocessed tensor ready for model input [1, T]
    """
    wav = torch.from_numpy(audio_np).float()
    
    # Normalize waveform using layer norm (as specified by NII model)
    with torch.no_grad():
        wav = torch.nn.functional.layer_norm(wav, wav.shape)
    
    # Add batch dimension
    return wav.unsqueeze(0)
